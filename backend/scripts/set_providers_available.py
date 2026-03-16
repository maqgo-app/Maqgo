import asyncio
import os
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient


def load_env_from_dotenv():
  """
  Carga variables desde backend/.env si existen.
  """
  backend_root = Path(__file__).resolve().parents[1]
  env_path = backend_root / ".env"
  if not env_path.exists():
    return

  with env_path.open("r", encoding="utf-8") as f:
    for line in f:
      line = line.strip()
      if not line or line.startswith("#") or "=" not in line:
        continue
      key, value = line.split("=", 1)
      key = key.strip()
      value = value.strip()
      os.environ.setdefault(key, value)


async def main():
  load_env_from_dotenv()

  mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
  db_name = os.environ.get("DB_NAME", "maqgo_db")

  client = AsyncIOMotorClient(mongo_url)
  db = client[db_name]

  print(f"Conectando a MongoDB en {mongo_url} (DB: {db_name})...")

  # Marcar todos los proveedores como disponibles
  result = await db.users.update_many(
    {"role": "provider"},
    {"$set": {"available": True}}
  )

  print(f"Proveedores actualizados como disponibles: {result.modified_count}")


if __name__ == "__main__":
  asyncio.run(main())

