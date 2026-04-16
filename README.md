# Excel Price Dashboard

Aplicación para analizar desviaciones de precio respecto al PVP. Subís un Excel, filtrás por usuario ML y visualizás el score de cumplimiento de precios por cliente.

---

## Requisitos

- **Node.js 18+** (vía NVM para Windows)
- **Python 3.10+**

---

## 1. Instalar NVM para Windows

1. Descargá el instalador desde: https://github.com/coreybutler/nvm-windows/releases  
   Bajá el archivo `nvm-setup.exe` de la última release.

2. Ejecutá el instalador y seguí los pasos.

3. Abrí una terminal nueva y verificá:
   ```bash
   nvm version
   ```

4. Instalá y usá Node.js 20 (LTS):
   ```bash
   nvm install 20
   nvm use 20
   node -v   # debería mostrar v20.x.x
   npm -v
   ```

---

## 2. Instalar Python

1. Descargá Python 3.11 desde: https://www.python.org/downloads/windows/

2. Durante la instalación, **tildá "Add Python to PATH"**.

3. Verificá en una terminal nueva:
   ```bash
   python --version   # Python 3.11.x
   pip --version
   ```

---

## 3. Instalar dependencias del proyecto

Desde la raíz del proyecto (`excel-dashboard/`):

```bash
# Dependencias del frontend + script de arranque
npm install

# Dependencias del backend
pip install -r backend/requirements.txt
```

---

## 4. Correr el proyecto

Con un solo comando desde la raíz:

```bash
npm run dev
```

Esto levanta en paralelo:

| Servicio | URL |
|----------|-----|
| API (FastAPI) | http://localhost:8000 |
| Frontend (Vite) | http://localhost:5173 |

Abrí el navegador en **http://localhost:5173**.

Para detenerlo: `Ctrl + C`

---

## 5. Uso

1. Arrastrá o seleccioná tu archivo `.xlsx` / `.xls`
2. Usá el filtro **Usuario ML** para ver un vendedor en particular
3. Buscá clientes por razón social o usuario en la barra de búsqueda
4. Hacé clic en un cliente para ver el detalle de operaciones y su score

---

## Score de cumplimiento

El score mapea el desvío respecto al PVP pactado en una escala del 1 al 10:

| % Desvío | Score |
|----------|-------|
| 0% | 8 |
| 5% | 7 |
| 10% | 6 |
| 15% | 5 |
| 20% | 4 |
| 25% | 3 |
| 30% | 2 |
| 35%+ | 1 |

**Verde** (8-10) · **Amarillo** (6-7) · **Naranja** (4-5) · **Rojo** (1-3)

---

## Estructura del proyecto

```
excel-dashboard/
├── backend/
│   ├── main.py            # API FastAPI
│   └── requirements.txt   # Dependencias Python
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── FileUpload.jsx
│   │       ├── Filters.jsx
│   │       ├── ClientList.jsx
│   │       ├── ClientDetail.jsx
│   │       └── Charts.jsx
│   └── package.json
└── package.json           # Script npm run dev (arranca todo)
```
