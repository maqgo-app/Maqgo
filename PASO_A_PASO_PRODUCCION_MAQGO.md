# Guía a prueba de todo: subir MAQGO a www.maqgo.cl

**Para quien nunca ha subido una app.** Un solo paso a la vez. No te saltes ninguno. Si algo no coincide con lo que ves, para y revisa la sección "Si algo sale mal" de esa parte.

---

## Antes de empezar – Ten esto a mano

- [ ] **Dominio maqgo.cl** – Donde lo compraste (Nic Chile, GoDaddy, etc.) y tu usuario/contraseña para entrar a **gestionar DNS**.
- [ ] **Navegador** – Chrome o Edge. Ten **dos pestañas** abiertas: esta guía en una, y en la otra irás abriendo MongoDB, Railway, Vercel.
- [ ] **Proyecto MAQGO en tu PC** – La carpeta donde está el código (con las carpetas `backend` y `frontend`; puede estar dentro de otra llamada `Maqgo1-main`).
- [ ] **Cuenta GitHub** – Con el proyecto MAQGO subido a un repositorio (si no está, lo subirás en la Parte B).

**No necesitas** saber programar más. Solo seguir los pasos y copiar/pegar donde diga.

---

## Cómo usar esta guía

- Cada paso es un **número**. Haz solo ese paso y luego el siguiente.
- Donde dice **"Anota"** o **"Guarda"**, copia el texto en un archivo o bloc de notas (lo usarás después).
- Donde dice **"Verifica"**, para un momento y comprueba que ves lo que se describe.
- **"Cuidado"** = error común; evítalo.
- **"Si no ves eso"** = qué hacer cuando la pantalla es distinta.

---

# PARTE A – Base de datos (MongoDB Atlas)

La base de datos es donde se guardan usuarios, reservas, etc. Atlas es la versión en la nube de MongoDB (gratis para empezar).

---

## A.1 – Abrir MongoDB Atlas y crear cuenta

1. En el navegador ve a: **https://cloud.mongodb.com**
2. **Si ya tienes cuenta:** clic en **Sign In** (arriba derecha) e inicia sesión. Ve al paso 3.
3. **Si no tienes cuenta:** clic en **Try Free** o **Sign Up**. Regístrate con tu email o con **Sign in with Google**. Completa el formulario y confirma el email si te lo piden.
4. Después de iniciar sesión deberías ver la pantalla principal de MongoDB Atlas (dashboard).

**Si no ves eso:** Si te pide "Create your first organization", en el campo escribe **MAQGO** y clic en **Next**. Luego puede pedir "Create your first project": escribe **MAQGO** y clic en **Next**. Si ofrece añadir miembros, ignora y clic en **Create Project**. Ya deberías estar en el dashboard.

---

## A.2 – Crear la base de datos (cluster)

1. En la pantalla del proyecto verás un botón verde **Build a database** (o **Create**). Haz **clic ahí**.
2. En "Choose a tier" verás varias opciones. Elige la que diga **FREE** (M0, Shared, 512 MB). Clic en **Create** de esa tarjeta.
3. En "Cloud Provider & Region" deja lo que venga por defecto (ej: AWS, N. Virginia) o elige la más cercana a Chile. No cambies nada más.
4. En "Cluster Name" puede quedar **Cluster0**. No lo cambies si no sabes.
5. Abajo de todo haz clic en **Create** (o **Create Cluster**).
6. Verás un mensaje de que se está creando. **Espera 1 a 3 minutos.** Cuando el cluster esté listo, verás **Cluster0** con un punto o indicador **Available** (verde).

**Verifica:** En la lista de clusters aparece **Cluster0** y el estado es Available. Si sigue "Creating", espera un poco más.

---

## A.3 – Crear usuario (para que la app pueda entrar a la base de datos)

1. En la misma pantalla te aparecerá un cuadro **Security Quickstart** (configuración de seguridad). Si no aparece, en el menú izquierdo entra a **Database Access** y clic en **Add New Database User**.
2. En "Create database user":
   - **Username:** escribe **maqgouser** (todo junto, minúsculas). Anótalo.
   - **Password:** clic en **Autogenerate Secure Password**. Se mostrará una contraseña (ej: `K7xP2mQ9nR`).
3. **Muy importante:** clic en el icono **Copy** (al lado de la contraseña) y pega esa contraseña en un archivo de texto o bloc de notas. **Guárdala:** la usarás en el paso A.5. Si la pierdes, tendrás que crear otro usuario.
4. Clic en **Create User** (abajo del cuadro).

**Verifica:** El usuario **maqgouser** aparece en la lista de Database Access (si entraste por Database Access). Si seguiste por Security Quickstart, sigue al siguiente paso.

---

## A.4 – Permitir que Railway se conecte (dirección IP)

1. En el mismo flujo de Security Quickstart verás la sección **"Where would you like to connect from?"** (desde dónde te conectarás). Si no la ves, en el menú izquierdo entra a **Network Access** y clic en **Add IP Address**.
2. Elige **Add IP Address** (o "Allow access from anywhere" si aparece).
3. En el campo "Access List Entry" escribe **exactamente**: **0.0.0.0/0**  
   (Cero, punto, cero, punto, cero, barra, cero. Significa "cualquier lugar de internet".)
4. En "Comment" (opcional) puedes escribir: **MAQGO production**.
5. Clic en **Finish and Close** (o **Confirm**).

**Verifica:** En Network Access aparece una entrada con **0.0.0.0/0** y estado "Active". Si no ves Network Access, en el menú izquierdo busca **Network Access** y comprueba que la IP esté ahí.

---

## A.5 – Obtener la URL de conexión (MONGO_URL)

Esta URL es la "dirección" que usará tu backend para conectarse a la base de datos. La usarás en Railway.

1. Vuelve a la pantalla del **cluster** (en el menú izquierdo, **Database** → clic en **Cluster0**).
2. En la tarjeta de tu cluster (Cluster0) verás un botón **Connect**. Haz **clic en Connect**.
3. Te preguntará "How do you want to connect?" (cómo quieres conectarte). Elige **Drivers** (conexión desde código/aplicación).
4. Verás un bloque de código y una cadena de texto que empieza por `mongodb+srv://`. Debajo de la cadena hay un botón **Copy**. Haz clic en **Copy**.
5. Pega lo que copiaste en un bloc de notas. Se verá parecido a esto (con tu usuario y un texto distinto en lugar de xxxxx):
   ```text
   mongodb+srv://maqgouser:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. **Sustituir la contraseña:** en esa línea, borra **`<password>`** (incluidos los símbolos < y >) y pega la contraseña que guardaste en A.3.
   - **Cuidado:** Si tu contraseña tiene caracteres especiales (@, #, :, /, etc.), pueden dar error. En ese caso, en Google busca "URL encode password" y convierte la contraseña, o crea en A.3 un usuario nuevo con "Autogenerate Secure Password" y usa esa sin cambiarla (solo copiar/pegar).
7. **Añadir el nombre de la base:** en la misma línea, busca la parte que dice **.mongodb.net/?** (punto, mongodb, punto, net, barra, interrogación). Justo **antes** del signo **?** añade **/maqgo_db**. Queda así: **.mongodb.net/maqgo_db?**
   - Ejemplo final (el tuyo tendrá tu usuario, contraseña y cluster):
   ```text
   mongodb+srv://maqgouser:K7xP2mQ9nR@cluster0.abc12.mongodb.net/maqgo_db?retryWrites=true&w=majority
   ```
8. Esa línea completa es tu **MONGO_URL**. **Cópiala de nuevo y guárdala** en un archivo; la necesitarás en la Parte B, paso B.5.

**Verifica:** La línea empieza por `mongodb+srv://`, en el medio tiene tu usuario y contraseña (sin <password>), y contiene `/maqgo_db?` antes de `retryWrites`.

**Si algo sale mal (Parte A):** Si no encuentras el botón Connect, asegúrate de estar en Database → Cluster0. Si la contraseña da error al usarla después, en Database Access edita el usuario maqgouser y genera una nueva contraseña sin caracteres raros; repite A.5 con esa.

---

# PARTE B – Subir el backend (API) a Railway

El backend es el "motor" de la app: recibe peticiones desde www.maqgo.cl y guarda/lee datos en MongoDB. Railway lo hospeda en la nube.

---

## B.1 – Tener el proyecto en GitHub

1. Si **ya tienes** el proyecto MAQGO en un repositorio de GitHub, anota el nombre del repo (ej: **mitienda/maqgo**). Sigue a B.2.
2. Si **no está en GitHub:** ve a **https://github.com**, inicia sesión, clic en **+** (arriba derecha) → **New repository**. Nombre: **maqgo** (o el que quieras). No marques "Add README". Clic en **Create repository**. Luego en tu PC abre la carpeta del proyecto MAQGO, abre terminal ahí y ejecuta (sustituye TU_USUARIO y maqgo por tu usuario y nombre del repo):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/maqgo.git
   git push -u origin main
   ```
   Si te pide usuario/contraseña, usa un Personal Access Token de GitHub en lugar de la contraseña. Cuando termine, el código estará en GitHub.

---

## B.2 – Entrar a Railway y conectar GitHub

1. En el navegador ve a **https://railway.app**
2. Arriba a la **derecha** haz clic en **Login**.
3. Elige **Login with GitHub**. Si te pide autorizar a Railway, clic en **Authorize**.
4. Después del login verás el dashboard de Railway (puede estar vacío). Haz clic en **New Project** (botón morado/oscuro).

**Si no ves "New Project":** Busca un botón que diga "Create new" o "Start a new project". Elige eso.

---

## B.3 – Elegir el repositorio de GitHub

1. Te preguntará "What do you want to deploy?". Elige **Deploy from GitHub repo** (o "GitHub repo").
2. Si sale "Configure GitHub App" o "Install GitHub App", clic en **Configure** (o **Install**). En la lista de repositorios marca **tu repo de MAQGO** (o "All repositories" si prefieres) y guarda.
3. Vuelve a Railway. En la lista de repositorios deberías ver tu repo (ej: **maqgo**). Haz **clic en el nombre del repo**.
4. Si pregunta "Which branch to deploy?", deja **main** (o master). Clic en **Deploy** o **Add variables and deploy**. Railway empezará a desplegar (verás logs o "Building...").

**Verifica:** En el proyecto de Railway aparece un "service" o tarjeta con el nombre de tu repo. Puede fallar el primer deploy porque aún no hemos puesto la carpeta correcta; lo arreglamos en B.4.

---

## B.4 – Decirle a Railway dónde está el backend

1. En el proyecto de Railway haz **clic en la tarjeta del servicio** (el cuadro que representa tu app).
2. Arriba verás pestañas: **Deployments**, **Settings**, **Variables**, **Metrics**. Haz clic en **Settings**.
3. Baja por la página hasta encontrar **Root Directory** (o "Source" / "Build").
4. En **Root Directory** haz clic en **Edit** (o en el campo) y escribe **exactamente**: **Maqgo1-main/backend**  
   - **Si tu repo no tiene carpeta Maqgo1-main** (solo ves carpetas `backend` y `frontend` en la raíz), escribe solo: **backend**
5. Busca **Build Command**. Si hay un campo, escribe: **pip install -r requirements.txt**
6. Busca **Start Command** o **Custom start command** o **Run command**. En ese campo escribe: **uvicorn server:app --host 0.0.0.0 --port $PORT**
7. Si hay botón **Save** o **Update**, haz clic. Railway volverá a desplegar.

**Verifica:** En Deployments debería aparecer un nuevo deploy "Building" y luego "Success" o "Active". Si falla, en el deploy haz clic y mira el log: suele fallar si Root Directory está mal (por ejemplo si escribiste "backend" pero tu repo tiene "Maqgo1-main/backend").

---

## B.5 – Añadir las variables (configuración secreta)

Las "variables" son datos que la app usa (URL de la base de datos, etc.) sin que estén escritos en el código. Railway las inyecta al ejecutar.

1. En el **mismo servicio** en Railway, haz clic en la pestaña **Variables** (junto a Settings).
2. Verás "Variables" o "Environment Variables" y un botón **+ New Variable** o **RAW Editor** o **Add Variable**. Si ves **RAW Editor**, puedes usarlo para pegar varias a la vez; si no, añade una por una con **+ New Variable**.
3. Añade **cada** variable. El **nombre** tiene que ser exactamente igual (mayúsculas/minúsculas). El **valor** lo indico entre comillas solo para que sepas qué poner; no pongas las comillas.

   - **Nombre:** `MONGO_URL`  
     **Valor:** La línea completa que guardaste en A.5 (empieza por mongodb+srv://... y termina en ...majority).

   - **Nombre:** `DB_NAME`  
     **Valor:** `maqgo_db`

   - **Nombre:** `CORS_ORIGINS`  
     **Valor:** `https://www.maqgo.cl,https://maqgo.cl`  
     (Sin espacios. Son los dominios desde los que se puede llamar a tu API.)

   - **Nombre:** `FRONTEND_URL`  
     **Valor:** `https://www.maqgo.cl`

   - **Nombre:** `MAQGO_DEMO_MODE`  
     **Valor:** `true`  
     (Así sigues usando el código 123456 para SMS hasta que pongas Twilio.)

   - **Nombre:** `TBK_DEMO_MODE`  
     **Valor:** `true`  
     (Pagos en modo prueba hasta que configures Transbank real.)

4. Después de guardar cada una (o todas si usaste RAW Editor), Railway puede redesplegar solo. Espera a que el último deploy esté en verde / Success.

**Cuidado:** En MONGO_URL no debe haber espacios al inicio ni al final. No pongas comillas en los valores en Railway.

**Verifica:** En la lista de Variables ves las 6 variables. MONGO_URL debe ser una línea larga que empieza por mongodb+srv://.

---

## B.6 – Crear la URL pública del backend (dominio de Railway)

1. En el mismo servicio, ve de nuevo a **Settings**.
2. Baja hasta **Networking** o **Public Networking** o **Domains**.
3. Busca el botón **Generate Domain** o **Add domain** o **Create Domain**. Haz clic.
4. Railway te dará una URL, algo como: **maqgo-production-abc12.up.railway.app**. **Cópiala** (sin https:// si lo añade él).
5. En el navegador abre esa URL y al final añade **/api/**. Ejemplo: **https://maqgo-production-abc12.up.railway.app/api/**
6. Deberías ver una página con texto en formato JSON, algo como: `{"message":"MAQGO API v1.0","status":"operational",...}`

**Verifica:** Si ves ese JSON, el backend está funcionando. Si ves error 404 o "Cannot GET", espera 1 minuto y prueba otra vez. Si sigue fallando, revisa que el Start Command en B.4 sea exactamente `uvicorn server:app --host 0.0.0.0 --port $PORT`.

---

## B.7 – Poner tu dominio api.maqgo.cl

Así la API responderá en **api.maqgo.cl** en lugar de la URL larga de Railway.

1. En Railway, en el mismo servicio → **Settings** → **Networking**.
2. Donde dice **Custom Domain** o **Add custom domain**, haz clic y escribe: **api.maqgo.cl** (sin https://, sin www). Confirma.
3. Railway te mostrará un mensaje tipo: "To add api.maqgo.cl, add a CNAME record in your DNS: **api** → **tu-proyecto.up.railway.app**". **Anota** el valor al que debe apuntar (la parte **tu-proyecto.up.railway.app**).
4. Abre **otra pestaña** y entra a la web donde gestionas el dominio **maqgo.cl** (Nic Chile, GoDaddy, Cloudflare, etc.). Inicia sesión.
5. Busca la sección **DNS**, **Registros DNS**, **Manage DNS** o **Zona DNS**. Entra ahí.
6. Crea un **nuevo registro**:
   - **Tipo:** CNAME (si te dan opciones).
   - **Nombre / Host / Subdominio:** **api** (solo eso; a veces el panel pone "api.maqgo.cl" automático).
   - **Valor / Apunta a / Target:** pega lo que Railway te dijo (ej: **maqgo-production-abc12.up.railway.app**) **sin** https:// y **sin** barra al final.
   - **TTL:** 300 o Auto (o déjalo por defecto).
7. Guarda los cambios (**Save**, **Add record**, etc.).
8. Vuelve a Railway. La verificación del dominio puede tardar **1 a 10 minutos**. Cuando aparezca un tick verde o "Verified" junto a api.maqgo.cl, prueba en el navegador: **https://api.maqgo.cl/api/** – deberías ver el mismo JSON que en B.6.

**Si no ves eso:** Si a los 15 minutos sigue sin verificar, revisa en tu DNS que el registro CNAME sea exactamente **api** → **xxxx.up.railway.app**. En algunos proveedores el nombre se escribe "api.maqgo.cl" y el valor solo "xxxx.up.railway.app". Si usas Cloudflare, desactiva el proxy (nube naranja) para el registro api y deja solo DNS (gris).

---

# PARTE C – Subir el frontend (la app web) a Vercel

El frontend es lo que el usuario ve en www.maqgo.cl (pantallas, botones). Vercel lo hospeda y lo sirve cuando alguien entra a la web.

---

## C.1 – Crear el archivo .env.production en tu PC

Este archivo le dice a la app en producción a qué API conectarse (api.maqgo.cl).

1. Abre la **carpeta del proyecto MAQGO** en tu computador (donde están backend y frontend).
2. Entra en la carpeta **frontend**.
3. Busca si existe un archivo llamado **.env.production.example**. Si existe, **cópialo** (clic derecho → Copiar) y en la misma carpeta **frontend** pega y renombra la copia a **.env.production** (quita el .example). Si no existe, crea un archivo **nuevo** llamado exactamente **.env.production** dentro de **frontend**.
4. Abre **.env.production** con Bloc de notas o cualquier editor de texto.
5. Escribe **solo** esta línea (una sola línea, sin espacios extra al inicio o final):
   ```text
   REACT_APP_BACKEND_URL=https://api.maqgo.cl
   ```
   No pongas **https://** dos veces. No pongas barra al final. Guarda el archivo y ciérralo.

**Cuidado:** El archivo puede llamarse .env.production (con el punto delante). En algunos sistemas los archivos que empiezan por punto están ocultos; en la carpeta frontend activa "mostrar archivos ocultos" si no lo ves.

---

## C.2 – (Opcional) Probar el build en tu PC

1. Abre la **terminal** (o CMD en Windows) en la carpeta del proyecto (donde está la carpeta frontend).
2. Escribe y ejecuta:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
3. Si todo va bien, al final dirá "built in X seconds" y se habrá creado la carpeta **dist** dentro de frontend. No tienes que subir esa carpeta a ningún lado; Vercel hará su propio build. Este paso solo sirve para comprobar que el proyecto compila.

**Si algo sale mal:** Si dice "command not found: npm", instala Node.js desde nodejs.org (versión LTS). Luego vuelve a ejecutar desde la carpeta del proyecto.

---

## C.3 – Entrar a Vercel y conectar GitHub

1. En el navegador ve a **https://vercel.com**
2. Clic en **Sign Up** (o **Log In** si ya tienes cuenta).
3. Elige **Continue with GitHub**. Autoriza a Vercel si te lo pide.
4. Después del login verás el dashboard de Vercel. Clic en **Add New…** (o "New Project") y luego **Project**.

---

## C.4 – Importar el repositorio de MAQGO

1. En "Import Git Repository" verás la lista de tus repos de GitHub. Si no aparece ninguno, clic en **Adjust GitHub App Permissions** y permite acceso al repo de MAQGO.
2. Busca el repo de MAQGO (ej: **maqgo**) y al lado clic en **Import**.

---

## C.5 – Configurar la carpeta y el build

**Antes de dar a Deploy**, en la misma pantalla configura lo siguiente. Si ya diste Deploy, ve a Settings después y cámbialo, luego Redeploy.

1. **Project Name:** puede quedar **maqgo** (o maqgo-app). No es crítico.
2. **Root Directory:** verás un campo que dice "root" o tiene una carpeta. Haz clic en **Edit** (o en el campo). Escribe: **Maqgo1-main/frontend**  
   - **Si tu repo no tiene carpeta Maqgo1-main**, escribe solo: **frontend**
3. **Framework Preset:** debe detectar **Vite**. Si pone "Other" o está vacío, elige **Vite** en el desplegable.
4. **Build Command:** debe decir **npm run build**. Si está vacío, escríbelo.
5. **Output Directory:** debe decir **dist**. Si está vacío, escríbelo.
6. **Install Command:** puede quedar **npm install** o vacío.

No des clic en Deploy todavía si quieres añadir la variable en el siguiente paso; si ya desplegaste, añade la variable en C.6 y luego Redeploy.

---

## C.6 – Añadir la variable REACT_APP_BACKEND_URL

1. En la misma pantalla de configuración, busca la sección **Environment Variables** (variables de entorno). Despliega la sección si está cerrada.
2. En el primer campo (Name / Key) escribe: **REACT_APP_BACKEND_URL**
3. En el segundo campo (Value) escribe: **https://api.maqgo.cl** (sin barra al final).
4. Clic en **Add** (o la flecha) para añadirla. Debe aparecer en la lista debajo.
5. Asegúrate de que esté marcada para **Production** (y si quieres también Preview).
6. Ahora sí: clic en **Deploy** (abajo de la página).

---

## C.7 – Esperar el deploy y probar la URL de Vercel

1. Verás el progreso del build (Building, Installing…). **Espera 1 a 3 minutos** sin cerrar.
2. Cuando termine, verás **"Congratulations!"** o "Your project has been deployed" y una URL como **maqgo-xxxx.vercel.app**.
3. Haz clic en **Visit** (o abre esa URL en el navegador). Debería cargar la app MAQGO (pantalla de inicio con "Empezar ahora" o similar).
4. Prueba: clic en **Empezar ahora**, regístrate con un email y teléfono de prueba, y cuando pida el código SMS escribe **123456**. Si entras al flujo sin error de "No se pudo conectar", la app está hablando con tu API.  
   Si sale "No se pudo conectar": en Vercel → tu proyecto → **Settings** → **Environment Variables**, revisa que **REACT_APP_BACKEND_URL** sea exactamente **https://api.maqgo.cl**. Luego en **Deployments** → los tres puntos del último deploy → **Redeploy**.

**Verifica:** La URL de Vercel (maqgo-xxx.vercel.app) muestra la app y el login con 123456 funciona.

---

## C.8 – Poner tu dominio www.maqgo.cl en Vercel

1. En el proyecto en Vercel, arriba haz clic en **Settings**.
2. En el menú de la izquierda, clic en **Domains**.
3. Donde dice "Add" o "Add domain", escribe: **www.maqgo.cl** y clic en **Add**.
4. Vercel te dirá qué registro DNS crear. Normalmente: **CNAME**, nombre **www**, valor **cname.vercel-dns.com** (o la URL que te muestre Vercel). **Anota** el valor exacto que te den.
5. Abre la web donde gestionas el dominio maqgo.cl (la misma donde creaste el CNAME de api en B.7).
6. En DNS, crea un **nuevo registro**:
   - **Tipo:** CNAME
   - **Nombre / Host:** **www**
   - **Valor / Target:** el que te dio Vercel (ej: **cname.vercel-dns.com**), sin https://
   - Guarda.
7. Vuelve a Vercel. La verificación puede tardar **unos minutos**. Cuando el dominio **www.maqgo.cl** muestre un tick verde o "Valid Configuration", abre en el navegador **https://www.maqgo.cl** – debe cargar la misma app que en la URL de Vercel.

**Verifica:** https://www.maqgo.cl abre la app MAQGO. Si tarda en propagar, espera hasta 1 hora y prueba de nuevo.

---

# PARTE D – Probar que todo está en producción

1. Abre **https://www.maqgo.cl** en el navegador (o en el celular).
2. Clic en **Empezar ahora** → completa email y teléfono de prueba → cuando pida código SMS escribe **123456**.
3. Elige **Soy Cliente** (o Proveedor si quieres) y haz un flujo corto: elegir maquinaria, ubicación, ver proveedores. No hace falta completar pago; solo comprobar que no salga error de red.
4. Si en algún momento sale **"No se pudo conectar"** o error de **CORS**:
   - En **Railway** → Variables: **CORS_ORIGINS** debe ser exactamente `https://www.maqgo.cl,https://maqgo.cl` (sin espacios).
   - En **Vercel** → Environment Variables: **REACT_APP_BACKEND_URL** debe ser exactamente `https://api.maqgo.cl`.
   - Después de cambiar, haz **Redeploy** en Railway y en Vercel.

Cuando la app cargue y puedas navegar sin errores, **MAQGO está en producción en www.maqgo.cl**.

---

# PARTE E – Opcionales (después del lanzamiento)

Solo cuando quieras activar SMS reales, pagos reales o mapas.

## E.1 – Twilio (SMS reales)

1. Cuenta en **https://www.twilio.com** → Sign up.
2. En Twilio: **Phone Numbers** → **Buy a number** (o usa uno de prueba). Anota el número (ej: +1234567890).
3. En **Account** (o Console): anota **Account SID** y **Auth Token**.
4. En **Railway** → tu servicio → **Variables** → añade: **TWILIO_ACCOUNT_SID**, **TWILIO_AUTH_TOKEN**, **TWILIO_SMS_FROM** (tu número). Cambia **MAQGO_DEMO_MODE** a **false**. Guarda; Railway redespliega.

## E.2 – Transbank OneClick (pagos reales)

1. En **https://www.transbankdevelopers.cl** configura tu comercio en **producción** y obtén códigos y llave secreta.
2. En **Railway** → **Variables**: **TBK_ENV** = `production`, **TBK_DEMO_MODE** = `false`, y los códigos/secretos de producción; **TBK_RETURN_URL** = `https://api.maqgo.cl/api/payments/oneclick/confirm-return`. Guarda; Railway redespliega.

## E.3 – Google Maps

1. En **https://console.cloud.google.com** activa **Maps JavaScript API** y **Places API**, crea una **API Key** y restríngela a `https://www.maqgo.cl/*`.
2. En **Vercel** → **Settings** → **Environment Variables**: **VITE_GOOGLE_MAPS_API_KEY** = tu API key. **Redeploy** el proyecto.

---

# Lista de chequeo (marca cada uno al terminar)

**PARTE A – MongoDB Atlas**
- [ ] A.1 Cuenta creada e iniciada sesión en cloud.mongodb.com
- [ ] A.2 Cluster FREE (M0) creado y en estado Available
- [ ] A.3 Usuario maqgouser creado y contraseña guardada en un archivo
- [ ] A.4 IP 0.0.0.0/0 añadida en Network Access
- [ ] A.5 MONGO_URL copiada, contraseña puesta, /maqgo_db añadido antes del ?, guardada para B.5

**PARTE B – Railway (backend)**
- [ ] B.1 Repo de MAQGO en GitHub
- [ ] B.2 Cuenta Railway creada con GitHub
- [ ] B.3 Repo conectado y primer deploy hecho
- [ ] B.4 Root Directory = Maqgo1-main/backend (o backend), Start Command = uvicorn server:app --host 0.0.0.0 --port $PORT
- [ ] B.5 Las 6 variables añadidas (MONGO_URL, DB_NAME, CORS_ORIGINS, FRONTEND_URL, MAQGO_DEMO_MODE, TBK_DEMO_MODE)
- [ ] B.6 Dominio de Railway generado y /api/ abre JSON en el navegador
- [ ] B.7 CNAME api → xxxx.up.railway.app en DNS; https://api.maqgo.cl/api/ muestra el mismo JSON

**PARTE C – Vercel (frontend)**
- [ ] C.1 Archivo .env.production en frontend con REACT_APP_BACKEND_URL=https://api.maqgo.cl
- [ ] C.2 (Opcional) npm run build en PC sin errores
- [ ] C.3 Cuenta Vercel con GitHub
- [ ] C.4 Repo MAQGO importado
- [ ] C.5 Root Directory = Maqgo1-main/frontend (o frontend), Build = npm run build, Output = dist
- [ ] C.6 Variable REACT_APP_BACKEND_URL = https://api.maqgo.cl en Vercel
- [ ] C.7 Deploy correcto; URL de Vercel carga la app y login 123456 funciona
- [ ] C.8 CNAME www → cname.vercel-dns.com en DNS; https://www.maqgo.cl carga la app

**PARTE D – Prueba final**
- [ ] D www.maqgo.cl abre, registro y código 123456 funcionan, flujo cliente sin error de conexión

**PARTE E – Opcionales (cuando quieras)**
- [ ] E.1 Twilio configurado y MAQGO_DEMO_MODE=false
- [ ] E.2 Transbank producción configurado
- [ ] E.3 Google Maps API key en Vercel y redeploy

---

**Nota sobre carpetas:** Si tu repositorio **no** tiene la carpeta **Maqgo1-main** (es decir, en la raíz del repo ves directamente **backend** y **frontend**), en Railway usa **backend** como Root Directory y en Vercel **frontend** como Root Directory.
