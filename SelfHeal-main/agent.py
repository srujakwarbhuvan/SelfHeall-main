import json
import os
from dotenv import load_dotenv
import base64
from datetime import datetime
from google import genai
from playwright.sync_api import sync_playwright

class WebHealerAgent:
    def __init__(self, config_path="config.json", scripts_path="scripts.json", heals_path="heals.json", fingerprints_path="fingerprints.json"):
        self.config_path = config_path
        self.scripts_path = scripts_path
        self.heals_path = heals_path
        self.fingerprints_path = fingerprints_path
        
        # Load Config
        self.config = self._load_json(self.config_path)
        self.gemini_api_key = self.config.get("gemini_api_key", "")
        self.heal_threshold = self.config.get("heal_threshold", 70)
        self.headless = self.config.get("headless", True)
        self.api_keys = self._get_api_keys()

    def _get_api_keys(self):
        # Load environment variables from .env if present
        load_dotenv()
        
        keys = []
        
        # Check GEMINI_API_KEYS (comma-separated env var)
        env_keys = os.environ.get("GEMINI_API_KEYS")
        if env_keys:
            keys.extend([k.strip() for k in env_keys.split(",") if k.strip()])
            
        # Check GEMINI_API_KEY (single env var)
        env_single_key = os.environ.get("GEMINI_API_KEY")
        if env_single_key:
            keys.append(env_single_key)
        
        # Fallback to config.json
        if not keys and self.config.get("gemini_api_key"):
            keys.append(self.config.get("gemini_api_key"))
            
        return list(dict.fromkeys(keys))

    def _load_json(self, path):
        if not os.path.exists(path):
            return {}
        with open(path, 'r') as f:
            try:
                return json.load(f)
            except:
                return {}

    def _save_json(self, path, data):
        with open(path, 'w') as f:
            json.dump(data, f, indent=4)

    # ── Heal cache ────────────────────────────────────────────────────────────

    def load_heals(self):
        """Read heals.json and return the full list of heal events."""
        if not os.path.exists(self.heals_path):
            return []
        with open(self.heals_path, 'r') as f:
            try:
                data = json.load(f)
                return data if isinstance(data, list) else []
            except json.JSONDecodeError:
                return []

    def save_heal(self, entry: dict):
        """Append a single heal event to heals.json.

        Required keys in entry:
            original_selector  – the broken selector that was used
            healed_to          – the new selector Gemini suggested
            method             – how the heal was found (e.g. 'gemini-ai', 'fuzzy')
            confidence         – int 0-100 from the AI response
            intent             – human-readable description of the element's purpose
            timestamp          – ISO-8601 string, e.g. datetime.utcnow().isoformat()
            script_name        – name of the script that triggered the heal
        """
        required_keys = {
            "original_selector", "healed_to", "method",
            "confidence", "intent", "timestamp", "script_name"
        }
        missing = required_keys - entry.keys()
        if missing:
            raise ValueError(f"save_heal: missing required keys: {missing}")

        heals = self.load_heals()
        heals.append(entry)
        self._save_json(self.heals_path, heals)

    # ── Gemini healing ────────────────────────────────────────────────────────

    def ask_gemini(self, broken_selector: str, page_html: str, intent: str, screenshot_b64: str = None) -> str | None:
        """Ask Gemini to return a replacement CSS selector for a broken one.

        Returns the raw selector string, or None if the call fails.
        """
        prompt = (
            f"You are fixing a broken web automation script.\n"
            f"Broken selector: {broken_selector}\n"
            f"Intent of this step: {intent}\n"
            f"Current page HTML (truncated to 3000 chars): {page_html[:3000]}\n"
            f"{'A screenshot of the failure is also provided.' if screenshot_b64 else ''}\n"
            f"Reply with ONLY a single CSS selector. No explanation. No markdown. Just the selector."
        )

        parts = [prompt]
        if screenshot_b64:
            # Multi-modal part
            parts.append(genai.types.Part.from_bytes(
                data=base64.b64decode(screenshot_b64),
                mime_type="image/png"
            ))

        for key in self.api_keys:
            try:
                # Use the new unified google-genai SDK style
                client = genai.Client(api_key=key)
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=parts
                )
                
                selector = response.text.strip().strip("`")
                if selector:
                    return selector
            except Exception as e:
                print(f"ask_gemini error with a key: {e}")
                continue
        print("ask_gemini error: All API keys failed.")
        return None

    # ── Self-healing click ────────────────────────────────────────────────────

    def healing_click(self, page, selector: str, intent: str, script_name: str):
        """Click an element with automatic self-healing on failure.

        Flow:
          1. Check heals.json for a cached fix with confidence >= threshold.
          2. Try page.click(selector, timeout=4000).
          3. On timeout: ask Gemini for a new selector and retry.
          4. On total failure: save a 'flagged' entry for manual review.
        """
        from datetime import datetime
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

        def _now():
            return datetime.utcnow().isoformat()

        def _log(msg):
            print(f"[{_now()}] {msg}")

        # ── 1. Cache lookup ──────────────────────────────────────────────────
        heals = self.load_heals()
        for entry in heals:
            if (
                entry.get("original_selector") == selector
                and entry.get("confidence", 0) >= self.heal_threshold
                and entry.get("healed_to", "not-found") != "not-found"
            ):
                cached_selector = entry["healed_to"]
                _log(f"Cache hit for {selector} → using {cached_selector}")
                page.click(cached_selector, timeout=4000)
                return

        # ── 2. Try original selector ─────────────────────────────────────────
        try:
            _log(f"Clicking: {selector}")
            page.click(selector, timeout=4000)
            return

        except PlaywrightTimeoutError:
            _log(f"Timeout on selector '{selector}'. Invoking Gemini heal...")

            # ── 3. Ask Gemini ─────────────────────────────────────────────────
            page_html = page.content()
            screenshot_b64 = None
            try:
                screenshot_b64 = base64.b64encode(page.screenshot()).decode("utf-8")
            except:
                pass
            new_selector = self.ask_gemini(selector, page_html, intent, screenshot_b64)

            if new_selector:
                try:
                    _log(f"Trying healed selector: {new_selector}")
                    page.click(new_selector, timeout=4000)

                    # Success — persist the heal
                    self.save_heal({
                        "original_selector": selector,
                        "healed_to": new_selector,
                        "method": "gemini-ai",
                        "confidence": 90,
                        "intent": intent,
                        "timestamp": _now(),
                        "script_name": script_name,
                    })
                    _log(f"Healed and clicked: {new_selector}")
                    return

                except PlaywrightTimeoutError:
                    _log(f"Healed selector '{new_selector}' also failed.")

            # ── 4. Flag for manual review ─────────────────────────────────────
            _log(f"FAILED to heal '{selector}'. Flagging for manual review.")
            self.save_heal({
                "original_selector": selector,
                "healed_to": "not-found",
                "method": "flagged",
                "confidence": 30,
                "intent": intent,
                "timestamp": _now(),
                "script_name": script_name,
            })

    # ── Self-healing fill ─────────────────────────────────────────────────────

    def healing_fill(self, page, selector: str, text: str, intent: str, script_name: str):
        """Fill a text field with automatic self-healing on failure.

        Same structure as healing_click but uses page.fill() instead of page.click().
        """
        from datetime import datetime
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

        def _now():
            return datetime.utcnow().isoformat()

        def _log(msg):
            print(f"[{_now()}] {msg}")

        # ── 1. Cache lookup ──────────────────────────────────────────────────
        heals = self.load_heals()
        for entry in heals:
            if (
                entry.get("original_selector") == selector
                and entry.get("confidence", 0) >= self.heal_threshold
                and entry.get("healed_to", "not-found") != "not-found"
            ):
                cached_selector = entry["healed_to"]
                _log(f"Cache hit for {selector} → using {cached_selector}")
                page.fill(cached_selector, text, timeout=4000)
                return

        # ── 2. Try original selector ─────────────────────────────────────────
        try:
            _log(f"Filling: {selector}")
            page.fill(selector, text, timeout=4000)
            return

        except PlaywrightTimeoutError:
            _log(f"Timeout on selector '{selector}'. Invoking Gemini heal...")

            # ── 3. Ask Gemini ─────────────────────────────────────────────────
            page_html = page.content()
            screenshot_b64 = None
            try:
                screenshot_b64 = base64.b64encode(page.screenshot()).decode("utf-8")
            except:
                pass
            new_selector = self.ask_gemini(selector, page_html, intent, screenshot_b64)

            if new_selector:
                try:
                    _log(f"Trying healed selector: {new_selector}")
                    page.fill(new_selector, text, timeout=4000)

                    self.save_heal({
                        "original_selector": selector,
                        "healed_to": new_selector,
                        "method": "gemini-ai",
                        "confidence": 90,
                        "intent": intent,
                        "timestamp": _now(),
                        "script_name": script_name,
                    })
                    _log(f"Healed and filled: {new_selector}")
                    return

                except PlaywrightTimeoutError:
                    _log(f"Healed selector '{new_selector}' also failed.")

            # ── 4. Flag for manual review ─────────────────────────────────────
            _log(f"FAILED to heal '{selector}'. Flagging for manual review.")
            self.save_heal({
                "original_selector": selector,
                "healed_to": "not-found",
                "method": "flagged",
                "confidence": 30,
                "intent": intent,
                "timestamp": _now(),
                "script_name": script_name,
            })

    def run_script(self, script_config: dict) -> dict:
        """Execute a script and return exactly:
        {"status": "complete"|"failed", "heals": int, "steps_done": int, "total_steps": int, "duration": float}
        """
        import time
        from datetime import datetime

        url = script_config.get("url", "")
        name = script_config.get("name", "unnamed_script")
        steps = script_config.get("steps", [])

        print(f"[{datetime.utcnow().isoformat()}] Starting script '{name}' → {url}")
        
        start_time = time.time()
        initial_heals_count = len(self.load_heals())
        steps_done = 0

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=self.headless)
                page = browser.new_page()
                page.goto(url)

                for step in steps:
                    action   = step.get("action", "")
                    selector = step.get("selector", "")
                    value    = step.get("value", "")
                    intent   = step.get("intent", "")

                    if action == "click":
                        self.healing_click(page, selector, intent, name)
                    elif action == "fill":
                        self.healing_fill(page, selector, value, intent, name)
                    elif action == "navigate":
                        page.goto(value)
                    elif action == "verify":
                        page.wait_for_selector(selector, timeout=5000)
                    else:
                        print(f"Unknown action: {action}")
                    
                    steps_done += 1

                browser.close()
                status = "complete"

        except Exception as e:
            print(f"[{datetime.utcnow().isoformat()}] Script '{name}' failed at step {steps_done + 1}: {e}")
            status = "failed"

        # Calculate metrics
        duration = round(time.time() - start_time, 2)
        final_heals_count = len(self.load_heals())
        heals_performed = final_heals_count - initial_heals_count

        result = {
            "status": status,
            "heals": heals_performed,
            "steps_done": steps_done,
            "total_steps": len(steps),
            "duration": duration
        }
        
        print(f"[{datetime.utcnow().isoformat()}] Script '{name}' finished: {result}")
        return result

    # ── Page scanning ─────────────────────────────────────────────────────────

    def scan_page(self, url: str) -> list:
        """Opens URL, extracts fingerprints for all interactive elements, 
        saves to heals.json, and returns the list of element dicts.
        """
        from datetime import datetime
        elements_data = []

        print(f"[{datetime.utcnow().isoformat()}] Scanning page: {url}")
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            page = browser.new_page()
            page.goto(url)
            
            # Find all interactive elements
            locators = page.locator("input, button, a, select").all()
            
            for loc in locators:
                # Evaluate attributes in the browser context safely
                tag   = loc.evaluate("el => el.tagName.toLowerCase()")
                el_id = loc.get_attribute("id") or ""
                cls   = loc.get_attribute("class") or ""
                typ   = loc.get_attribute("type") or ""
                ph    = loc.get_attribute("placeholder") or ""
                text  = loc.inner_text().strip()[:100]  # truncate huge texts
                role  = loc.get_attribute("role") or ""

                # Construct a fingerprint
                fingerprint = {
                    "tag": tag,
                    "id": el_id,
                    "class": cls,
                    "type": typ,
                    "placeholder": ph,
                    "text": text,
                    "role": role,
                    "scanned_url": url,
                    "timestamp": datetime.utcnow().isoformat()
                }
                elements_data.append(fingerprint)

            browser.close()

        # Save to fingerprints.json instead of heals.json to avoid pollution
        fingerprints = self._load_json(self.fingerprints_path)
        if not isinstance(fingerprints, list):
            fingerprints = []
            
        for fp in elements_data:
            fingerprints.append({
                "original_selector": "scanned-element",
                "method": "fingerprint",
                "timestamp": fp["timestamp"],
                "fingerprint": fp
            })
        self._save_json(self.fingerprints_path, fingerprints)

        print(f"[{datetime.utcnow().isoformat()}] Scan complete. Found {len(elements_data)} elements.")
        return elements_data


if __name__ == "__main__":
    import sys
    import os
    
    agent = WebHealerAgent()
    
    # Run the hardcoded demo if no arguments provided
    if len(sys.argv) == 1:
        v1_html = os.path.join(os.getcwd(), "shop_v1.html")
        v2_html = os.path.join(os.getcwd(), "shop_v2.html")
        
        if not os.path.exists(v1_html) or not os.path.exists(v2_html):
            print("Demo files not found. Ensure shop_v1.html and shop_v2.html exist.")
            sys.exit(1)
            
        demo_url_v1 = f"file:///{v1_html.replace(chr(92), '/')}"
        demo_url_v2 = f"file:///{v2_html.replace(chr(92), '/')}"
        
        # 1. Scan the v1 page first to build cache blueprints
        agent.scan_page(demo_url_v1)
        
        # The base steps use v1's selectors
        base_steps = [
            {"action": "navigate", "value": demo_url_v1},
            {"action": "fill", "selector": "#email-input", "value": "test@kameleon.ai", "intent": "Fill email address"},
            {"action": "fill", "selector": "#promo-input", "value": "SAVE20", "intent": "Fill promo code"},
            {"action": "click", "selector": "#place-order-btn", "intent": "Click the place order button"}
        ]
        
        script_v1 = {"name": "shop_demo_v1", "url": demo_url_v1, "steps": base_steps.copy()}
        
        script_v2 = {"name": "shop_demo_v2", "url": demo_url_v2, "steps": base_steps.copy()}
        script_v2["steps"][0] = {"action": "navigate", "value": demo_url_v2}
        
        print("\n" + "="*50)
        print("          🏃 RUN 1: KAMELEON DEMO (v1)")
        print("="*50 + "\n")
        
        res1 = agent.run_script(script_v1)
        
        print("\n" + "-"*50)
        print("          🔄 RUN 2: REDESIGNED LAYOUT (v2)")
        print("          (All CSS selectors are broken)")
        print("-"*50 + "\n")
        
        res2 = agent.run_script(script_v2)
        
        print("\n" + "="*50)
        print("          📊 DEMO SUMMARY")
        print("="*50)
        print(f"Run 1: {res1['heals']} heals | Run 2: {res2['heals']} heals | Total time: {round(res1['duration'] + res2['duration'], 2)}s")
        print("="*50 + "\n")
        
    else:
        # Optional CLI runner for defined scripts
        script_name = sys.argv[1]
        scripts = agent._load_json(agent.scripts_path)
        if script_name in scripts:
            config = scripts[script_name]
            config["name"] = script_name
            agent.run_script(config)
        else:
            print(f"Script {script_name} not found.")

