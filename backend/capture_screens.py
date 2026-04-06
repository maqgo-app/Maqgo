import asyncio
from playwright.async_api import async_playwright
import os
import zipfile

async def capture_all_screens():
    output_dir = "/app/frontend/public/screenshots"
    os.makedirs(output_dir, exist_ok=True)
    
    # Limpiar screenshots anteriores
    for f in os.listdir(output_dir):
        if f.endswith('.png'):
            os.remove(f"{output_dir}/{f}")
    
    screens = [
        # Onboarding
        ("/", "01_welcome"),
        ("/register", "02_register"),
        ("/login", "03_login"),
        ("/select-role", "04_role_selection"),
        # Cliente
        ("/client/home", "05_client_home"),
        ("/client/hours", "06_hours"),
        ("/client/calendar", "07_calendar"),
        ("/client/machinery", "08_machinery"),
        ("/client/providers", "09_providers_5opciones"),
        # Proveedor onboarding
        ("/provider/data", "15_provider_data"),
        ("/provider/machine-data", "16_machine_data"),
        ("/provider/machine-photos", "17_machine_photos"),
        ("/provider/operator-data", "18_operator_data"),
        ("/provider/review", "19_review"),
        # Proveedor solicitud
        ("/provider/request-received", "20_request_received"),
    ]
    
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 430, "height": 932})
        
        for path, name in screens:
            url = f"http://localhost:5174{path}"
            try:
                await page.goto(url, wait_until="networkidle", timeout=10000)
                
                if 'providers' in path or 'request' in path:
                    await asyncio.sleep(2.5)
                else:
                    await asyncio.sleep(1.5)
                
                # Caso especial: operator-data con dos estados
                if path == "/provider/operator-data":
                    await page.screenshot(path=f"{output_dir}/{name}_yo_mismo.png")
                    print(f"OK: {name}_yo_mismo")
                    
                    try:
                        await page.click('text=Otro operador')
                        await asyncio.sleep(0.8)
                        await page.screenshot(path=f"{output_dir}/{name}_form.png")
                        print(f"OK: {name}_form")
                    except:
                        pass
                # Caso especial: fotos - mostrar con 3 fotos
                elif path == "/provider/machine-photos":
                    # Primero sin fotos
                    await page.screenshot(path=f"{output_dir}/{name}_vacio.png")
                    print(f"OK: {name}_vacio")
                    # Agregar 3 fotos
                    for _ in range(3):
                        try:
                            await page.click('text=Agregar foto')
                            await asyncio.sleep(0.3)
                        except:
                            pass
                    await asyncio.sleep(0.5)
                    await page.screenshot(path=f"{output_dir}/{name}_completo.png")
                    print(f"OK: {name}_completo")
                else:
                    await page.screenshot(path=f"{output_dir}/{name}.png")
                    print(f"OK: {name}")
                    
            except Exception as e:
                print(f"ERROR {name}: {e}")
        
        # Capturas especiales con flujo
        print("\n--- Capturas con flujo ---")
        
        # 10. Seleccionar proveedor -> Confirmar Servicio
        await page.goto("http://localhost:5174/client/providers", wait_until="networkidle", timeout=10000)
        await asyncio.sleep(2.5)
        await page.click('button:has-text("Seleccionar")')
        await asyncio.sleep(2)
        await page.screenshot(path=f"{output_dir}/10_confirm_service_top.png")
        print("OK: 10_confirm_service_top")
        
        # Scroll para ver garantía
        await page.evaluate('window.scrollTo(0, 300)')
        await asyncio.sleep(0.5)
        await page.screenshot(path=f"{output_dir}/11_confirm_service_bottom.png")
        print("OK: 11_confirm_service_bottom")
        
        # 12. Búsqueda secuencial
        await page.fill('input[placeholder*="Providencia"]', 'Av. Providencia 1234, Santiago')
        await asyncio.sleep(0.5)
        await page.click('button:has-text("CONFIRMAR Y PAGAR")')
        await asyncio.sleep(2)
        await page.screenshot(path=f"{output_dir}/12_searching_sequential.png")
        print("OK: 12_searching_sequential")
        
        # 13. Maquinaria asignada
        await page.goto("http://localhost:5174/client/assigned", wait_until="networkidle", timeout=10000)
        await asyncio.sleep(1.5)
        await page.screenshot(path=f"{output_dir}/13_machinery_assigned.png")
        print("OK: 13_machinery_assigned")
        
        # 14. Operador llegó
        await page.goto("http://localhost:5174/client/provider-arrived", wait_until="networkidle", timeout=10000)
        await asyncio.sleep(1.5)
        await page.screenshot(path=f"{output_dir}/14_provider_arrived.png")
        print("OK: 14_provider_arrived")
        
        await browser.close()
    
    # Create ZIP
    zip_path = "/app/frontend/public/MAQGO_Screenshots.zip"
    if os.path.exists(zip_path):
        os.remove(zip_path)
        
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(os.listdir(output_dir)):
            if f.endswith('.png'):
                zf.write(f"{output_dir}/{f}", f)
                print(f"Added: {f}")
    
    print(f"\n✅ ZIP actualizado: {zip_path}")
    print(f"Total archivos: {len([f for f in os.listdir(output_dir) if f.endswith('.png')])}")

if __name__ == "__main__":
    asyncio.run(capture_all_screens())
