# 🚀 Deploying SelfHeal to Render

Follow these exact steps to deploy the SelfHeal dashboard and API to Render.

## 📋 Prerequisites
1.  **Google Gemini API Key**: Get one from [Google AI Studio](https://aistudio.google.com/app/apikey).
2.  **Firebase Project (Optional but Recommended)**: 
    *   Create a project at [Firebase Console](https://console.firebase.google.com/).
    *   Enable **Realtime Database**.
    *   Copy your config for the `.env` variables.
3.  **GitHub Repo**: Push this project to a GitHub repository.

---

## ⚡ Option A: Render Blueprint (Recommended)
The project includes a `render.yaml` file. This is the fastest way to deploy.

1.  Log in to [Render](https://dashboard.render.com/).
2.  Click **New +** > **Blueprint**.
3.  Connect your GitHub repository.
4.  Render will automatically detect `render.yaml` and prompt you for the required environment variables:
    *   `GEMINI_API_KEY`: Your primary Gemini API key.
    *   `DATABASE_URL`: (Optional) Your PostgreSQL connection string if you chose Option B for persistence.
    *   Firebase Variables: (Optional) If you want cloud syncing enabled.
5.  Click **Apply**.

---

## 🛠️ Option B: Manual Web Service Setup
If you prefer to configure the service manually:

1.  Click **New +** > **Web Service**.
2.  Connect your GitHub repository.
3.  Set the following configuration:
    *   **Name**: `selfheal-dashboard`
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npx playwright install --with-deps chromium`
    *   **Start Command**: `node src/server/index.js`
4.  Navigate to the **Environment** tab and add:
    *   `PORT`: `10000`
    *   `NODE_VERSION`: `18.0.0` or higher.
    *   `GEMINI_API_KEY`: Your API key.
    *   `NODE_ENV`: `production`
5.  Click **Create Web Service**.

---

## 💾 Handling Persistence
Render’s filesystem is **ephemeral**. This means SQLite data in `data/heals.db` will be lost on every restart/redeploy. 

To ensure your healing data is permanent:
*   **Best Way**: Use the **Firebase Cloud Sync** already built into the project. Just add your Firebase credentials to the Render Environment Variables.
*   **Alternative**: Use a **Render Managed PostgreSQL** database. Use the `src/storage/healHistory.pg.js` implementation and set the `DATABASE_URL` environment variable.

---

## 🧪 Testing Your Deployment
1.  Once the build is complete, open your Render URL (e.g., `https://selfheal-dashboard.onrender.com`).
2.  The Live Dashboard should appear and show "WebSocket connected".
3.  You can trigger a **Demo Run** directly from the dashboard to see the healing engine in action on the cloud!

## 🔍 Troubleshooting
*   **Build Fails**: Ensure `npx playwright install --with-deps chromium` is in the build command. Render needs this to run any test logic.
*   **429 Errors**: If you hit Gemini rate limits, add more keys to the `GEMINI_API_KEYS` (comma-separated) environment variable for automatic rotation.
*   **WebSocket Issues**: Ensure you are connecting via `https://`—Render handles the SSL termination and WebSocket proxying automatically.

---
*SelfHeal Deployment Guide — 2026*
