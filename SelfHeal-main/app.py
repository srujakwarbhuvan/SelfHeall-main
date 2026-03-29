from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import json
import os
import uuid
import time
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS on all routes

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE  = os.path.join(BASE_DIR, "config.json")
SCRIPTS_FILE = os.path.join(BASE_DIR, "scripts.json")
HEALS_FILE        = os.path.join(BASE_DIR, "heals.json")
FINGERPRINTS_FILE = os.path.join(BASE_DIR, "fingerprints.json")

from agent import WebHealerAgent

# Instantiate WebHealerAgent once as a singleton
agent = WebHealerAgent(
    config_path=CONFIG_FILE,
    scripts_path=SCRIPTS_FILE,
    heals_path=HEALS_FILE,
    fingerprints_path=FINGERPRINTS_FILE
)

# Add security and request logging
SELFHEAL_SECRET = os.environ.get("SELFHEAL_SECRET", "shhh-auto-heal-secret")

@app.before_request
def security_shield():
    """Prevent unauthorized access to /api/ endpoints."""
    # Allow OPTIONS for CORS
    if request.method == "OPTIONS":
        return
        
    # Log the request
    print(f"[{datetime.utcnow().isoformat()}] {request.method} {request.path}")
    
    # Enforce security on API routes
    if request.path.startswith("/api/"):
        provided_secret = request.headers.get("X-SelfHeal-Secret")
        if provided_secret != SELFHEAL_SECRET:
             return return_error("Unauthorized: Invalid or missing X-SelfHeal-Secret header", 401)

def load_json(path, default=None):
    if default is None:
        default = {}
    if not os.path.exists(path):
        return default
    with open(path, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return default

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=4)

def return_error(msg, status=400):
    print(f"ERROR {status}: {msg}")
    return jsonify({"error": msg}), status


# ── API Routes ───────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def serve_frontend():
    """Serves webhealer.html directly from the root folder."""
    html_path = os.path.join(BASE_DIR, "webhealer.html")
    if not os.path.exists(html_path):
        return return_error("webhealer.html not found.", 404)
    return send_file(html_path)


@app.route("/api/config", methods=["GET"])
def get_config():
    """Returns config.json contents, masking the API key (first 8 chars + '...')."""
    try:
        config = load_json(CONFIG_FILE)
        api_key = config.get("gemini_api_key", "")
        if len(api_key) > 8:
            config["gemini_api_key"] = api_key[:8] + "..."
        return jsonify(config)
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/config", methods=["POST"])
def post_config():
    """Updates config.json."""
    try:
        data = request.json or {}
        config = load_json(CONFIG_FILE)
        
        # Only update if explicitly provided, and avoid overwriting with the masked '...' version
        if "gemini_api_key" in data and not data["gemini_api_key"].endswith("..."):
            config["gemini_api_key"] = data["gemini_api_key"]
        if "heal_threshold" in data:
            config["heal_threshold"] = data["heal_threshold"]
        if "headless" in data:
            config["headless"] = data["headless"]
            
        save_json(CONFIG_FILE, config)
        
        # Update singleton if config changed
        if hasattr(agent, "api_keys"):
            agent.config = config
            agent.gemini_api_key = config.get("gemini_api_key", "")
            agent.heal_threshold = config.get("heal_threshold", 70)
            agent.headless = config.get("headless", True)
            agent.api_keys = agent._get_api_keys()

        return jsonify({"status": "saved"})
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/heals", methods=["GET"])
def api_get_heals():
    """Reads heals.json, returns the full list as JSON."""
    try:
        return jsonify(load_json(HEALS_FILE, default=[]))
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/scripts", methods=["GET"])
def api_get_scripts():
    """Reads scripts.json, returns the full list (or dict) as JSON."""
    try:
        return jsonify(load_json(SCRIPTS_FILE, default={}))
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/scripts", methods=["POST"])
def api_create_script():
    """Appends a new script to scripts.json with added fields."""
    try:
        data = request.json or {}
        url  = data.get("url")
        name = data.get("name")
        
        if not url:
            return return_error("Missing 'url' field")
        if not name:
            return return_error("Missing 'name' field")
            
        scripts = load_json(SCRIPTS_FILE, default={})
        
        script_id = str(uuid.uuid4())
        new_script = {
            "id": script_id,
            "name": name,
            "url": url,
            "threshold": data.get("threshold", 70),
            "steps": data.get("steps", []),
            "status": "idle",
            "confidence": None,
            "last_selector": None,
            "created_at": datetime.utcnow().isoformat()
        }
        
        scripts[script_id] = new_script
        save_json(SCRIPTS_FILE, scripts)
        
        return jsonify(new_script)
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/run", methods=["POST"])
def api_run_script():
    """Runs a script using agent.run_script(script_config)."""
    try:
        data = request.json or {}
        script_id   = data.get("script_id")
        script_name = data.get("script_name")
        
        scripts = load_json(SCRIPTS_FILE, default={})
        
        # Searching by ID or Name
        target_script = None
        target_key = None
        
        if script_id and script_id in scripts:
            target_key = script_id
            target_script = scripts[script_id]
        elif script_name:
            for k, v in scripts.items():
                if v.get("name") == script_name:
                    target_key = k
                    target_script = v
                    break
                    
        if not target_script:
            return return_error(f"Script not found matching id='{script_id}' or name='{script_name}'", 404)

        # ── Simple Validation ──
        steps = target_script.get("steps", [])
        if not isinstance(steps, list) or len(steps) == 0:
            name_label = script_name or script_id or "unnamed"
            return return_error(f"Script '{name_label}' has no steps to execute.", 400)
            
        for i, step in enumerate(steps):
            if "action" not in step:
                return return_error(f"Step {i+1} is missing the required 'action' field.", 400)
            
        # Update status to running
        target_script["status"] = "running"
        scripts[target_key] = target_script
        save_json(SCRIPTS_FILE, scripts)
        
        # Execute run_script using singleton agent
        # Build the exact config required by agent.py
        script_config = target_script.copy()
        if "name" not in script_config:
            script_config["name"] = target_script.get("name", target_key)
            
        run_stats = agent.run_script(script_config)
        
        # Update status back
        target_script["status"] = run_stats.get("status", "failed")
        scripts = load_json(SCRIPTS_FILE, default={}) # Reload in case file changed during run
        scripts[target_key] = target_script
        save_json(SCRIPTS_FILE, scripts)
        
        return jsonify(run_stats)
        
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/scan", methods=["POST"])
def api_scan_page():
    """Calls agent.scan_page(url) and returns list of found elements."""
    try:
        data = request.json or {}
        url  = data.get("url")
        if not url:
            return return_error("Missing 'url' field")

        elements = agent.scan_page(url)
        return jsonify(elements)
        
    except Exception as e:
        return return_error(str(e), 500)


@app.route("/api/heal", methods=["POST"])
def api_heal():
    """Takes a broken selector, DOM string, and intent, asks Gemini for a fix."""
    try:
        data = request.json or {}
        broken_selector = data.get("broken_selector")
        page_html = data.get("page_html")
        intent = data.get("intent", "No specific intent")

        if not broken_selector or not page_html:
            return return_error("Missing 'broken_selector' or 'page_html'")

        new_selector = agent.ask_gemini(broken_selector, page_html, intent)
        if new_selector:
            return jsonify({
                "new_selector": new_selector, 
                "confidence": 90, 
                "root_cause": "Resolved via python standalone backend"
            })
        else:
            return return_error("Failed to generate a healed selector", 500)
    except Exception as e:
        return return_error(str(e), 500)


if __name__ == "__main__":
    # Bind to 127.0.0.1 only for security to prevent external SSRF.
    # Note: If exposing publicly, ensure a robust reverse proxy with HTTPS is used.
    print(f"\n   🔒 SELFHEAL SERVER STARTED")
    print(f"   ----------------------------------------")
    print(f"   API endpoints require X-SelfHeal-Secret")
    print(f"   Binding to 127.0.0.1 only (local only)\n")
    
    app.run(debug=True, host="127.0.0.1", port=5000)

