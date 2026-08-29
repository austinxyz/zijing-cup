import os, sys
from dotenv import load_dotenv
load_dotenv(".env")
url = os.environ["DATABASE_URL"]
assert "127.0.0.1" in url or "localhost" in url, "refusing: not a local database"
url = url.replace("postgresql+psycopg://", "postgresql://")
import psycopg
path = sys.argv[1]
sql = open(path, encoding="utf-8").read()
with psycopg.connect(url, autocommit=True) as conn:
    conn.execute(sql)
print("applied locally:", path)
