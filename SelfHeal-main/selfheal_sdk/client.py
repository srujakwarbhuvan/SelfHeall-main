import requests

class SelfHealClient:
    def __init__(self, backend_url="http://localhost:5000"):
        self.backend_url = backend_url.rstrip('/')
        
    def heal_selector(self, broken_selector, page_html, intent):
        """Asks the backend to heal a selector based on the DOM and intent."""
        try:
            res = requests.post(f"{self.backend_url}/api/heal", json={
                "broken_selector": broken_selector,
                "page_html": page_html,
                "intent": intent
            }, timeout=30)
            data = res.json()
            if res.status_code == 200 and "new_selector" in data:
                return data["new_selector"]
            else:
                print(f"SelfHeal Backend Error: {data.get('error', 'Unknown')}")
                return None
        except Exception as e:
            print(f"SelfHeal Request Failed: {e}")
            return None

def heal_click(page, selector, intent="", timeout=4000, client=None):
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    if client is None:
        client = SelfHealClient()
        
    try:
        page.click(selector, timeout=timeout)
        return True
    except PlaywrightTimeoutError:
        print(f"  [SelfHeal] ⚠️ Timeout clicking '{selector}'. Healing...")
        page_html = page.content()
        new_selector = client.heal_selector(selector, page_html, intent)
        
        if new_selector:
            print(f"  [SelfHeal] ✅ Healed to: '{new_selector}'")
            page.click(new_selector, timeout=timeout)
            return True
        else:
            print(f"  [SelfHeal] ❌ Failed to heal '{selector}'")
            raise

def heal_fill(page, selector, value, intent="", timeout=4000, client=None):
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    if client is None:
        client = SelfHealClient()
        
    try:
        page.fill(selector, value, timeout=timeout)
        return True
    except PlaywrightTimeoutError:
        print(f"  [SelfHeal] ⚠️ Timeout filling '{selector}'. Healing...")
        page_html = page.content()
        new_selector = client.heal_selector(selector, page_html, intent)
        
        if new_selector:
            print(f"  [SelfHeal] ✅ Healed to: '{new_selector}'")
            page.fill(new_selector, value, timeout=timeout)
            return True
        else:
            print(f"  [SelfHeal] ❌ Failed to heal '{selector}'")
            raise
