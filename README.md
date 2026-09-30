# SAMUDRA — Ocean Intelligence

SAMUDRA is a web-based ocean intelligence and visualization platform built with **React + Vite + CesiumJS** on the frontend and **Python + FastAPI** on the backend.

The application provides an interactive 3D globe and ocean-data dashboard for exploring marine information such as:

- Ocean temperature
- Salinity
- Chlorophyll
- Wave conditions
- Ocean currents
- Bathymetry / seafloor information
- EEZ information
- Potential Fishing Zone (PFZ) information
- ARGO profile data
- Global Fishing Watch vessel information
- Interactive latitude/longitude selection on the globe

## Project Structure

```text
SAMUDRA/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── .env
│   ├── test-data/
│   └── ...
│
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   ├── .env
│   ├── public/
│   └── src/
│       ├── App.jsx
│       ├── App.css
│       ├── components/
│       ├── pages/
│       └── services/
│
└── README.md
```

## Technology Stack

### Frontend

- React
- Vite
- CesiumJS
- Recharts
- Lucide React
- Axios

### Backend

- Python
- FastAPI
- Uvicorn
- Copernicus Marine
- Xarray
- NumPy
- Requests
- BeautifulSoup
- python-dotenv

### Data / Services

SAMUDRA currently integrates external marine-data and mapping services used by the project, including:

- Copernicus Marine
- Global Fishing Watch
- INCOIS PFZ services
- GEBCO / bathymetry-related services
- EMODnet bathymetry tiles
- Cesium ion

## Requirements

Install these before starting:

- Python 3.11 recommended
- Node.js 18+ recommended
- npm
- Git

Python 3.11 is recommended for compatibility with the scientific Python/Copernicus stack.

Check your versions:

```powershell
python --version
node --version
npm --version
git --version
```

## 1. Clone the Repository

After creating the GitHub repository:

```powershell
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

Replace `YOUR_USERNAME` and `YOUR_REPOSITORY` with your GitHub username and repository name.

## 2. Backend Setup

Open a terminal in the project root:

```powershell
cd backend
```

Create a virtual environment:

```powershell
python -m venv venv
```

Activate it in Windows PowerShell:

```powershell
.env\Scripts\Activate.ps1
```

If PowerShell blocks script execution, use Command Prompt:

```cmd
venv\Scripts\activate
```

Install the backend dependencies:

```powershell
pip install -r requirements.txt
```

### Backend Environment Variables

Create:

```text
backend/.env
```

Use this structure:

```env
COPERNICUS_USERNAME=your_copernicus_username
COPERNICUS_PASSWORD=your_copernicus_password
GFW_API_KEY=your_global_fishing_watch_api_key
```

Do **not** commit the real `.env` file to GitHub.

Start the FastAPI backend:

```powershell
uvicorn main:app --reload
```

The backend normally runs at:

```text
http://127.0.0.1:8000
```

FastAPI documentation:

```text
http://127.0.0.1:8000/docs
```

## 3. Frontend Setup

Open a second terminal.

From the project root:

```powershell
cd frontend
```

Install JavaScript dependencies:

```powershell
npm install
```

The required frontend packages are already defined in:

```text
frontend/package.json
```

Start the Vite development server:

```powershell
npm run dev
```

Vite will display the local development URL, normally:

```text
http://localhost:5173
```

Open that URL in your browser.

## 4. Frontend Environment Variables

Create:

```text
frontend/.env
```

Use your own credentials:

```env
VITE_CESIUM_TOKEN=your_cesium_ion_token
GFW_API_KEY=your_global_fishing_watch_api_key
```

Only variables intended for the Vite frontend should use the `VITE_` prefix.

Do not publish real API keys or tokens in GitHub.

## 5. Running the Full Project

You need **two terminals**.

### Terminal 1 — Backend

```powershell
cd backend
.env\Scripts\Activate.ps1
uvicorn main:app --reload
```

### Terminal 2 — Frontend

```powershell
cd frontend
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

## 6. Frontend Commands

Development:

```powershell
npm run dev
```

Production build:

```powershell
npm run build
```

Preview the production build:

```powershell
npm run preview
```

Lint:

```powershell
npm run lint
```

## 7. GitHub Push — First Time

From the project root:

```powershell
git init
git add .
git commit -m "Initial commit - SAMUDRA Ocean Intelligence"
```

Rename the branch to `main`:

```powershell
git branch -M main
```

Connect your GitHub repository:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
```

Push:

```powershell
git push -u origin main
```

## 8. GitHub Push — Future Changes

After making changes:

```powershell
git status
git add .
git commit -m "Update SAMUDRA"
git push
```

For a specific change, use a meaningful commit message, for example:

```powershell
git add .
git commit -m "Add bathymetry layer"
git push
```

## 9. Important: Protect API Keys and Passwords

Before pushing to GitHub, make sure these files are ignored:

```text
backend/.env
frontend/.env
venv/
node_modules/
__pycache__/
*.pyc
dist/
```

Never commit:

- Copernicus username/password
- Global Fishing Watch API key
- Cesium ion token
- Any other private API credentials

If a real credential has already been committed to GitHub, **rotate/revoke that credential** and create a new one. Simply deleting the file in a later commit does not remove the secret from Git history.

## 10. Recommended `.gitignore`

Create a `.gitignore` file in the project root:

```gitignore
# Python
__pycache__/
*.py[cod]
*.pyo
*.pyd
venv/
.venv/
env/

# Python environment files
.env
*.env

# Node
node_modules/
frontend/node_modules/

# Vite build
dist/
frontend/dist/

# Logs
*.log

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Local caches
.cache/

# Cesium generated/build files
frontend/node_modules/.vite/
```

If you want to keep example environment files in GitHub, name them:

```text
backend/.env.example
frontend/.env.example
```

and put only placeholder values inside them.

## 11. Recommended `.env.example` Files

### `backend/.env.example`

```env
COPERNICUS_USERNAME=your_copernicus_username
COPERNICUS_PASSWORD=your_copernicus_password
GFW_API_KEY=your_global_fishing_watch_api_key
```

### `frontend/.env.example`

```env
VITE_CESIUM_TOKEN=your_cesium_ion_token
GFW_API_KEY=your_global_fishing_watch_api_key
```

## 12. Troubleshooting

### Backend does not start

Check that the virtual environment is active:

```powershell
.env\Scripts\Activate.ps1
```

Then:

```powershell
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend does not start

From `frontend`:

```powershell
npm install
npm run dev
```

### Port 8000 already in use

Stop the existing Uvicorn process or use another port:

```powershell
uvicorn main:app --reload --port 8001
```

If you change the backend port, update the frontend API URLs accordingly.

### Cesium globe does not load

Check that:

1. `VITE_CESIUM_TOKEN` is present in `frontend/.env`.
2. The frontend was restarted after changing `.env`.
3. `npm install` completed successfully.
4. Browser developer tools do not show a Cesium token or asset error.

### Ocean data does not load

Check that:

1. FastAPI is running.
2. `backend/.env` contains the required Copernicus credentials.
3. The selected location has valid data in the requested dataset.
4. The backend terminal does not show a Copernicus/API error.

## 13. Development Workflow

A simple workflow for contributing changes:

```text
Create branch
     ↓
Make changes
     ↓
Run backend
     ↓
Run frontend
     ↓
Test the feature
     ↓
git status
     ↓
git add .
     ↓
git commit
     ↓
git push
```

Example:

```powershell
git checkout -b feature/bathymetry
```

After testing:

```powershell
git add .
git commit -m "Add bathymetry visualization"
git push -u origin feature/bathymetry
```

## 14. Project Status

SAMUDRA is an actively developed ocean-intelligence visualization project.

The current repository contains the React/Cesium frontend, FastAPI backend, marine-data integrations, ARGO-related pages, PFZ functionality, ocean parameter retrieval, and supporting test data included with the project.

## 15. License

Add the project's license here before public release.

For example:

```text
MIT License
```

Only add a license if you have decided that the project should use it.
