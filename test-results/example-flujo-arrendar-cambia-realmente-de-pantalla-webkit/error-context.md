# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: example.spec.js >> flujo arrendar cambia realmente de pantalla
- Location: e2e/example.spec.js:52:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Selecciona ubicación')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Selecciona ubicación')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Saltar al contenido" [ref=e2]:
    - /url: "#root"
  - generic [ref=e5]:
    - generic [ref=e9]:
      - button "Volver al inicio" [ref=e11] [cursor=pointer]:
        - img [ref=e12]
        - generic [ref=e14]: Volver al inicio
      - img [ref=e16]
      - heading "Iniciar sesión" [level=2] [ref=e17]
      - paragraph [ref=e18]:
        - button "Entrar con correo y contraseña" [ref=e19] [cursor=pointer]
      - generic [ref=e20]:
        - generic [ref=e21]: Ingresa tu celular
        - generic [ref=e22]:
          - generic [ref=e23]: "+56"
          - textbox "Nueve dígitos del celular, empezando con 9" [ref=e24]:
            - /placeholder: "912345678"
      - button "Continuar con tu celular" [disabled] [ref=e25]: Continuar
    - button "Abrir asistente MAQGO" [ref=e26] [cursor=pointer]:
      - img [ref=e27]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test('home carga correctamente', async ({ page }) => {
  4   |   await page.goto('https://www.maqgo.cl');
  5   |   await expect(page.locator('text=Arrendar maquinaria')).toBeVisible();
  6   | });
  7   | 
  8   | test('CTA principal navega', async ({ page }) => {
  9   |   await page.goto('https://www.maqgo.cl');
  10  |   await page.click('text=Arrendar maquinaria');
  11  |   await expect(page.url()).not.toBe('https://www.maqgo.cl/');
  12  | });
  13  | 
  14  | test('términos no redirige a login', async ({ page }) => {
  15  |   await page.goto('https://www.maqgo.cl');
  16  |   await page.click('text=Términos y Condiciones');
  17  |   await expect(page.url()).not.toContain('login');
  18  | });
  19  | 
  20  | test('iniciar sesión funciona', async ({ page }) => {
  21  |   await page.goto('https://www.maqgo.cl');
  22  |   await page.click('text=Iniciar sesión');
  23  |   await expect(page.url()).toContain('login');
  24  | });
  25  | 
  26  | test('mobile layout básico', async ({ page }) => {
  27  |   await page.setViewportSize({ width: 375, height: 812 });
  28  |   await page.goto('https://www.maqgo.cl');
  29  |   await expect(page.locator('text=Arrendar maquinaria')).toBeVisible();
  30  |   await expect(page.locator('text=FAQ')).toBeVisible();
  31  | });
  32  | 
  33  | test('volver atrás no rompe la app', async ({ page }) => {
  34  |   await page.goto('https://www.maqgo.cl');
  35  |   await page.click('text=Arrendar maquinaria');
  36  |   await page.goBack();
  37  |   await expect(page.locator('text=Arrendar maquinaria')).toBeVisible();
  38  | });
  39  | 
  40  | test('flujo proveedor inicia correctamente', async ({ page }) => {
  41  |   await page.goto('https://www.maqgo.cl');
  42  |   await page.click('text=Ofrecer mi maquinaria');
  43  |   await expect(page.url()).not.toBe('https://www.maqgo.cl/');
  44  | });
  45  | 
  46  | test('no errores visibles en pantalla', async ({ page }) => {
  47  |   await page.goto('https://www.maqgo.cl');
  48  |   await expect(page.locator('text=Algo salió mal')).toHaveCount(0);
  49  |   await expect(page.locator('text=Error')).toHaveCount(0);
  50  | });
  51  | 
  52  | test('flujo arrendar cambia realmente de pantalla', async ({ page }) => {
  53  |   await page.goto('https://www.maqgo.cl');
  54  | 
  55  |   await page.click('text=Arrendar maquinaria');
  56  | 
  57  |   // VALIDACIÓN REAL (no solo URL)
> 58  |   await expect(page.locator('text=Selecciona ubicación')).toBeVisible({ timeout: 5000 });
      |                                                           ^ Error: expect(locator).toBeVisible() failed
  59  | });
  60  | 
  61  | 
  62  | test('debug flujo arrendar', async ({ page }) => {
  63  |   await page.goto('https://www.maqgo.cl');
  64  | 
  65  |   await page.click('text=Arrendar maquinaria');
  66  | 
  67  |   await page.waitForTimeout(3000);
  68  | 
  69  |   console.log('URL actual:', page.url());
  70  | 
  71  |   const bodyText = await page.locator('body').innerText();
  72  |   console.log('Contenido visible:', bodyText.slice(0, 500));
  73  | });
  74  | 
  75  | 
  76  | test('debug flujo pantallas cliente', async ({ page }) => {
  77  |   await page.goto('https://www.maqgo.cl');
  78  | 
  79  |   await page.click('text=Arrendar maquinaria');
  80  | 
  81  |   await page.waitForTimeout(2000);
  82  | 
  83  |   console.log('URL después de click:', page.url());
  84  | });
  85  | 
  86  | 
  87  | test('usuario logueado entra directo a flujo cliente', async ({ page }) => {
  88  |   await page.goto('https://www.maqgo.cl');
  89  | 
  90  |   // Simular usuario logueado (ajustar según cómo guardas sesión)
  91  |   await page.addInitScript(() => {
  92  |     
  93  |   });
  94  | 
  95  |   await page.reload();
  96  | 
  97  |   await page.click('text=Arrendar maquinaria');
  98  | 
  99  |   await expect(page.url()).not.toContain('login');
  100 | });
  101 | 
  102 | 
```