# MANTRA — Ocean Intelligence 

MANTRA is a web-based ocean intelligence and visualization platform built with **React + Vite + CesiumJS** on the frontend and **Python + FastAPI** on the backend.

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
MANTRA/
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

MANTRA currently integrates external marine-data and mapping services used by the project, including:

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
git clone https://github.com/Allen-Jusvin/MANTRA.git
cd MANTRA
```


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
