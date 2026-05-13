<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# School Counseling Reservation

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/41bbb32a-61ce-4064-b1bd-148785d10177

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This project includes a GitHub Actions workflow that builds the Vite app and deploys the `dist` folder to GitHub Pages.

1. Push this repository to GitHub.
2. In GitHub, open **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to the `main` branch, or run **Deploy to GitHub Pages** manually from the **Actions** tab.

For `https://github.com/YIICTSC/school-counseling-reservation`, the site URL will be:

`https://yiictsc.github.io/school-counseling-reservation/`
