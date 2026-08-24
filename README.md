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
cd frontend && npm install && cd ..

# Dependencias del backend
pip install -r backend/requirements.txt

npm install -g concurrency
```

También podés instalar todo una sola vez desde la raíz:

```bash
npm run setup
```

La aplicación usa Turso en todos los entornos. Para desarrollo local, copiá `.env.example` a `.env` y completá:

```env
DATABASE_TURSO_DATABASE_URL=libsql://tu-base.turso.io
DATABASE_TURSO_AUTH_TOKEN=tu-token-secreto
```



---

## 4. Usuario administrador y arranque inicial

En el primer arranque, la API crea las tablas de Turso y el usuario `admin` automáticamente. El seeder es idempotente: los siguientes arranques o despliegues no cambian una cuenta existente.

También podés crear otro administrador manualmente. El comando solicita la contraseña de forma oculta y exige al menos 14 caracteres y tres tipos de caracteres:

```bash
npm run create-user
```

Para ejecutar manualmente el mismo seeder idempotente:

```bash
npm run seed-user
```

Para restablecerla desde la terminal y cerrar todas las sesiones existentes:

```bash
python -m backend.manage_user admin --reset
```

---

## 5. Correr el proyecto

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

### Desplegar en Vercel

1. En **Build and Deployment**, seleccioná **Services** como framework del proyecto.
2. Confirmá que estén definidas para Production y Preview las variables `DATABASE_TURSO_DATABASE_URL` y `DATABASE_TURSO_AUTH_TOKEN`.
3. Desplegá normalmente. Vercel instala por separado las dependencias de `frontend/` y `backend/`; al iniciar la API se crean el esquema y el usuario inicial si todavía no existen.
4. Si usás un dominio personalizado, agregá `PVP_ALLOWED_ORIGINS=https://tu-dominio` y `PVP_ALLOWED_HOSTS=tu-dominio`.

---

## 6. Uso

1. Arrastrá o seleccioná tu archivo `.xlsx` / `.xls`
2. Usá el filtro **Usuario ML** para ver un vendedor en particular
3. Buscá clientes por razón social o usuario en la barra de búsqueda
4. Hacé clic en un cliente para ver el detalle de operaciones y su score

---

## Seguridad y producción

- Todas las rutas de datos requieren una sesión revocable. Los tokens se guardan como hashes y viajan en cookies `HttpOnly` con `SameSite=Strict`.
- Las operaciones que modifican datos requieren un token CSRF adicional. Los intentos de inicio de sesión se limitan y las contraseñas se derivan con `scrypt` y salt aleatorio.
- Los archivos Excel tienen límites de tamaño, expansión, hojas, filas y columnas. Los nombres provenientes del archivo no se interpolan en SQL.
- En producción, serví exclusivamente por HTTPS y configurá las variables de [`.env.example`](.env.example) en el entorno del proceso. No uses Vite como servidor público.
- El proxy/TLS que sirva el build estático debe agregar también la política CSP incluida en `frontend/vite.config.js`.
- `backend/*.db` está ignorado para evitar nuevos commits de datos. Si un archivo de datos ya estuvo versionado, retiralo también del historial del repositorio antes de publicarlo.
- Turso es obligatorio: usuarios, sesiones, configuración y filas importadas se guardan en la misma base remota mediante `DATABASE_TURSO_DATABASE_URL` y `DATABASE_TURSO_AUTH_TOKEN`.
- Vercel limita cada request y response de Functions a 4,5 MB; en Vercel la aplicación limita los Excel a 4 MB y comprime las respuestas JSON. Para archivos o respuestas mayores hace falta dividir/paginar el flujo.

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
