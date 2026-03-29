/**
 * Estado en localStorage para E2E de checkout.
 * Cada export es una función autocontenida (sin helpers ni llamadas cruzadas):
 * Playwright serializa el cuerpo al navegador.
 */

/** Sesión + proveedor + ubicación para montar P5 completo (CTA habilitado) */
export function seedCheckoutEmbudoSession() {
  const provider = {
    id: 'prov-e2e-1',
    price_per_hour: 50000,
    transport_fee: 8000,
    operator_name: 'Juan Operador',
    rating: 4.9,
  };
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-e2e-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem(
    'registerData',
    JSON.stringify({
      nombre: 'E2E',
      apellido: 'Test',
      email: 'e2e@test.cl',
      celular: '912345678',
      rut: '12345678-9',
      password: 'Password123!',
    })
  );
  localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('reservationType', 'immediate');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('additionalDays', '0');
  localStorage.setItem('selectedDate', '');
  localStorage.setItem('selectedDates', JSON.stringify([]));
  localStorage.setItem('selectedProvider', JSON.stringify(provider));
  localStorage.setItem('matchedProviders', JSON.stringify([provider]));
  localStorage.setItem('selectedProviderIds', JSON.stringify(['prov-e2e-1']));
  localStorage.setItem('needsInvoice', 'false');
}

export function seedEmbudoWithPaymentSnapshot() {
  const provider = {
    id: 'prov-e2e-1',
    price_per_hour: 50000,
    transport_fee: 8000,
    operator_name: 'Juan Operador',
    rating: 4.9,
  };
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-e2e-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem(
    'registerData',
    JSON.stringify({
      nombre: 'E2E',
      apellido: 'Test',
      email: 'e2e@test.cl',
      celular: '912345678',
      rut: '12345678-9',
      password: 'Password123!',
    })
  );
  localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('reservationType', 'immediate');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('additionalDays', '0');
  localStorage.setItem('selectedDate', '');
  localStorage.setItem('selectedDates', JSON.stringify([]));
  localStorage.setItem('selectedProvider', JSON.stringify(provider));
  localStorage.setItem('matchedProviders', JSON.stringify([provider]));
  localStorage.setItem('selectedProviderIds', JSON.stringify(['prov-e2e-1']));
  localStorage.setItem('needsInvoice', 'false');
  localStorage.setItem('clientBookingStep', 'payment');
  localStorage.setItem('bookingProgress', JSON.stringify({ step: 'payment' }));
}

export function seedEmbudoWithBillingSnapshot() {
  const provider = {
    id: 'prov-e2e-1',
    price_per_hour: 50000,
    transport_fee: 8000,
    operator_name: 'Juan Operador',
    rating: 4.9,
  };
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-e2e-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem(
    'registerData',
    JSON.stringify({
      nombre: 'E2E',
      apellido: 'Test',
      email: 'e2e@test.cl',
      celular: '912345678',
      rut: '12345678-9',
      password: 'Password123!',
    })
  );
  localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('reservationType', 'immediate');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('additionalDays', '0');
  localStorage.setItem('selectedDate', '');
  localStorage.setItem('selectedDates', JSON.stringify([]));
  localStorage.setItem('selectedProvider', JSON.stringify(provider));
  localStorage.setItem('matchedProviders', JSON.stringify([provider]));
  localStorage.setItem('selectedProviderIds', JSON.stringify(['prov-e2e-1']));
  localStorage.setItem('needsInvoice', 'true');
  localStorage.setItem('clientBookingStep', 'confirm');
  localStorage.setItem('bookingProgress', JSON.stringify({ step: 'payment' }));
}

export function seedEmbudoForPaymentResultSuccess() {
  const provider = {
    id: 'prov-e2e-1',
    price_per_hour: 50000,
    transport_fee: 8000,
    operator_name: 'Juan Operador',
    rating: 4.9,
  };
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('userId', 'client-e2e-1');
  localStorage.setItem('userRole', 'client');
  localStorage.setItem(
    'registerData',
    JSON.stringify({
      nombre: 'E2E',
      apellido: 'Test',
      email: 'e2e@test.cl',
      celular: '912345678',
      rut: '12345678-9',
      password: 'Password123!',
    })
  );
  localStorage.setItem('serviceLocation', 'Av. Providencia 1234, Santiago');
  localStorage.setItem('selectedMachinery', 'retroexcavadora');
  localStorage.setItem('reservationType', 'immediate');
  localStorage.setItem('selectedHours', '4');
  localStorage.setItem('additionalDays', '0');
  localStorage.setItem('selectedDate', '');
  localStorage.setItem('selectedDates', JSON.stringify([]));
  localStorage.setItem('selectedProvider', JSON.stringify(provider));
  localStorage.setItem('matchedProviders', JSON.stringify([provider]));
  localStorage.setItem('selectedProviderIds', JSON.stringify(['prov-e2e-1']));
  localStorage.setItem('needsInvoice', 'false');
  localStorage.setItem('totalAmount', '150000');
  localStorage.setItem('maxTotalAmount', '150000');
  localStorage.setItem(
    'servicePricing',
    JSON.stringify({
      service_amount: 100000,
      transport_cost: 8000,
      final_price: 150000,
    })
  );
}
