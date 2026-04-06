from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
import os

def create_screens_pdf():
    # Screenshots to include
    screenshots = [
        ("/tmp/01_welcome.png", "C01 - WelcomeScreen"),
        ("/tmp/02_register.png", "C03 - RegisterScreen"),
        ("/tmp/03_role.png", "C09 - RoleSelection"),
        ("/tmp/04_client_home.png", "C10 - ClientHome (Tipo Reserva)"),
        ("/tmp/05_hours.png", "HoursSelectionScreen"),
        ("/tmp/06_calendar.png", "CalendarMultiDayScreen"),
        ("/tmp/07_machinery.png", "MachinerySelection"),
        ("/tmp/08_providers.png", "ProviderOptionsScreen"),
        ("/tmp/09_provider_data.png", "P04 - ProviderDataScreen"),
        ("/tmp/10_machine_data.png", "P05 - MachineDataScreen"),
        ("/tmp/11_machine_photos.png", "P06 - MachinePhotosScreen"),
        ("/tmp/12_operator_data.png", "P07 - OperatorDataScreen (Yo mismo)"),
        ("/tmp/13_operator_form.png", "P07 - OperatorDataScreen (Multi-operador)"),
        ("/tmp/14_review.png", "P08 - ReviewScreen"),
    ]
    
    output_path = "/app/frontend/public/MAQGO_Pantallas_Review.pdf"
    
    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4
    
    # Title page
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(width/2, height - 2*inch, "MAQGO - Compilado de Pantallas")
    c.setFont("Helvetica", 14)
    c.drawCentredString(width/2, height - 2.5*inch, "Para revisión - Diciembre 2024")
    c.setFont("Helvetica", 12)
    c.drawCentredString(width/2, height - 3*inch, "Diseño: Plano industrial (sin gradientes, sin sombras)")
    c.drawCentredString(width/2, height - 3.3*inch, "Color principal: #EC6819 (solo CTAs)")
    c.drawCentredString(width/2, height - 3.6*inch, "Fondo: #2D2D2D")
    
    # List of screens
    c.setFont("Helvetica-Bold", 14)
    c.drawString(1*inch, height - 4.5*inch, "Pantallas incluidas:")
    c.setFont("Helvetica", 11)
    y = height - 5*inch
    for i, (_, name) in enumerate(screenshots, 1):
        c.drawString(1.2*inch, y, f"{i}. {name}")
        y -= 0.3*inch
    
    c.showPage()
    
    # Add each screenshot
    for img_path, title in screenshots:
        if os.path.exists(img_path):
            c.setFont("Helvetica-Bold", 14)
            c.drawCentredString(width/2, height - 0.5*inch, title)
            
            # Load and resize image to fit page
            img = Image.open(img_path)
            img_width, img_height = img.size
            
            # Calculate scaling to fit page (with margins)
            max_width = width - 2*inch
            max_height = height - 1.5*inch
            
            scale = min(max_width/img_width, max_height/img_height)
            new_width = img_width * scale
            new_height = img_height * scale
            
            # Center image
            x = (width - new_width) / 2
            y = (height - new_height) / 2 - 0.3*inch
            
            c.drawImage(img_path, x, y, new_width, new_height)
            c.showPage()
    
    c.save()
    print(f"PDF created: {output_path}")
    return output_path

if __name__ == "__main__":
    create_screens_pdf()
