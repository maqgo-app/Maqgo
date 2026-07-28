# Transbank Oneclick Certificacion con Tarjetas de Prueba

Identificador operativo para la linea de certificacion Oneclick con tarjetas de prueba.

## Alcance

- Reutilizable para repetir certificacion en los proximos dias.
- Separada de la integracion Oneclick ya estable en produccion.
- No implica modificar la implementacion productiva.

## Scripts asociados

- `cert_oneclick_headful_inscription.py`
- `case_01_credit_rejected.py`
- `case_02_credit_ok.py`
- `case_03_authorize_rejected.py`
- `case_03_authorize_rejected_reuse_case2.py`
- `case_04_authorize_ok.py`
- `case_05_authorize_installments.py`
- `case_05_authorize_installments_reuse_case2.py`
- `case_06_debit_ok.py`
- `case_07_debit_authorize_ok.py`
- `case_08_debit_authorize_rejected.py`
- `case_09_cancel_inscription.py`
- `run_case5_certification.sh`
- `run_case6_certification.sh`
- `run_case7_certification.sh`
- `run_case8_certification.sh`
- `run_case9_certification.sh`

## Regla

Esta linea existe solo para certificacion y tarjetas de prueba. No tocar la integracion Oneclick productiva al reutilizarla.

## Ubicacion actual

- `backend/certification-support/oneclick/cases`
- `backend/certification-support/oneclick/runners`
- `backend/certification-support/oneclick/poc`
- `backend/certification-support/oneclick/docs`
