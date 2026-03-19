import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Chat interno obligatorio', () => {
  it('App.jsx registra la ruta /chat/:serviceId', () => {
    const app = read('App.jsx');
    expect(app).toContain('/chat/:serviceId');
  });

  it('ServiceChat usa mensajes rápidos según el requerimiento', () => {
    const src = read('components/ServiceChat.js');
    expect(src).toContain("Voy en camino");
    expect(src).toContain("Llegaré en unos minutos");
    expect(src).toContain("Estoy retrasado");
    expect(src).toContain("Ya estoy en el lugar");
    expect(src).toContain("Estoy disponible");
    expect(src).toContain("¿Dónde estás?");
    expect(src).toContain("Estoy en camino");
  });
});

describe('Seguridad de chat', () => {
  it('chatSecurity detecta tel / whatsapp y números', async () => {
    const { messageContainsPhoneOrContact } = await import('../utils/chatSecurity.js');
    expect(messageContainsPhoneOrContact('tel:+56912345678')).toBe(true);
    expect(messageContainsPhoneOrContact('wa.me/56912345678')).toBe(true);
    expect(messageContainsPhoneOrContact('+56 9 1234 5678')).toBe(true);
  });

  it('backend bloquea compartir contacto en mensajes', () => {
    const backend = readFileSync(
      join(root, '..', '..', 'backend', 'routes', 'messages.py'),
      'utf8'
    );
    expect(backend).toContain('Por seguridad, no compartas datos de contacto. Usa el chat de MAQGO');
    expect(backend).toContain('content_contains_phone_or_contact');
  });
});

