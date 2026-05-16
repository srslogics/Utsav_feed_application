import json
from datetime import date
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


app = FastAPI(title="Utsav Farmer App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_FILE = BASE_DIR / "data.json"
DATA_LOCK = Lock()

WEBSITE_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/website.html": "website.html",
    "/website-about.html": "website-about.html",
    "/website-farmers.html": "website-farmers.html",
    "/website-contact.html": "website-contact.html",
    "/website-platform.html": "website-platform.html",
    "/styles.css": "styles.css",
    "/app.js": "app.js",
}


DEFAULT_DATA = {
    "profile": {
        "farmer_name": "Rakesh Verma",
        "cluster": "Korba Cluster",
        "farm_name": "Utsav Partner Farm 12",
        "farmer_code": "UF-042",
        "phone": "+91 9876543210",
        "active_batch": "B-2405",
        "bird_age_days": 24,
        "field_officer": "Anil Sahu",
    },
    "feed_stock": [
        {"shed": "Shed A", "feed_type": "Pre-starter", "bags": 8},
        {"shed": "Shed A", "feed_type": "Starter", "bags": 22},
        {"shed": "Shed B", "feed_type": "Starter", "bags": 14},
        {"shed": "Shed B", "feed_type": "Finisher", "bags": 30},
    ],
    "feed_inward": [
        {"date": "2026-05-14", "feed_type": "Starter", "bags": 18, "shed": "Shed A"},
        {"date": "2026-05-12", "feed_type": "Finisher", "bags": 24, "shed": "Shed B"},
        {"date": "2026-05-09", "feed_type": "Starter", "bags": 20, "shed": "Shed B"},
    ],
    "mortality_log": [
        {"date": "2026-05-15", "shed": "Shed A", "birds": 18, "notes": "Morning entry"},
        {"date": "2026-05-14", "shed": "Shed B", "birds": 12, "notes": "Heat stress watch"},
        {"date": "2026-05-13", "shed": "Shed A", "birds": 10, "notes": "Normal range"},
    ],
    "medicine_stock": [
        {"name": "Electrolyte", "status": "Available", "quantity": "4 packs", "notes": "Current farm stock"},
        {"name": "Respiratory support", "status": "Required", "quantity": "2 bottles", "notes": "Requested today"},
        {"name": "Vitamin mix", "status": "Available", "quantity": "3 bottles", "notes": "Used in morning line"},
    ],
    "medicine_log": [
        {"date": "2026-05-15", "name": "Vitamin mix", "status": "Given", "quantity": "1 bottle", "notes": "6:30 AM administration"},
        {"date": "2026-05-14", "name": "Liver tonic", "status": "Given", "quantity": "500 ml", "notes": "Routine support"},
        {"date": "2026-05-13", "name": "Electrolyte", "status": "Available", "quantity": "1 pack", "notes": "Held in reserve"},
    ],
    "requests": [
        {
            "date": "2026-05-15",
            "type": "Medicine required",
            "priority": "High",
            "details": "Respiratory support needed for Shed B.",
            "status": "Under review",
        },
        {
            "date": "2026-05-14",
            "type": "Feed shortage",
            "priority": "Medium",
            "details": "Starter feed inward request for evening loading.",
            "status": "Processed",
        },
        {
            "date": "2026-05-12",
            "type": "Shed issue",
            "priority": "Low",
            "details": "Water line issue in Shed A.",
            "status": "Closed",
        },
    ],
}


class LoginPayload(BaseModel):
    phone: str
    password: str


class MortalityPayload(BaseModel):
    shed: str
    birds: int = Field(gt=0)
    notes: str = ""
    entry_date: str | None = None


class FeedBalancePayload(BaseModel):
    shed: str
    feed_type: str
    bags: int = Field(ge=0)


class FeedInwardPayload(BaseModel):
    inward_date: str
    feed_type: str
    bags: int = Field(gt=0)
    shed: str


class MedicinePayload(BaseModel):
    name: str
    status: str
    quantity: str
    notes: str = ""
    entry_date: str | None = None


class RequestPayload(BaseModel):
    type: str
    priority: str
    details: str


def ensure_data_file() -> None:
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(DEFAULT_DATA, indent=2))


def load_data() -> dict:
    ensure_data_file()
    return json.loads(DATA_FILE.read_text())


def save_data(data: dict) -> None:
    DATA_FILE.write_text(json.dumps(data, indent=2))


def today_string() -> str:
    return str(date.today())


def make_feed_balances(records: list[dict]) -> list[dict]:
    totals: dict[str, int] = {}
    type_map: dict[str, list[str]] = {}

    for record in records:
        shed = record["shed"]
        totals[shed] = totals.get(shed, 0) + int(record["bags"])
        type_map.setdefault(shed, []).append(f'{record["feed_type"]}: {record["bags"]}')

    items = [
        {
            "label": shed,
            "value": f"{totals[shed]} bags",
            "note": " / ".join(type_map[shed]),
        }
        for shed in sorted(totals)
    ]
    items.append(
        {
            "label": "Total farm",
            "value": f"{sum(totals.values())} bags",
            "note": "Current available stock across sheds",
        }
    )
    return items


def make_feed_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["feed_type"]} / {record["shed"]}',
            "value": f'{record["bags"]} bags',
        }
        for record in records
    ]


def make_medicine_summary(records: list[dict]) -> list[dict]:
    return [
        {
            "label": record["status"],
            "value": record["name"],
            "note": f'{record["quantity"]} • {record["notes"]}',
        }
        for record in records[:6]
    ]


def make_medicine_log(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["name"]}',
            "value": f'{record["status"]} • {record["quantity"]}',
        }
        for record in records
    ]


def make_request_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["type"]}',
            "value": f'{record["status"]} • {record["priority"]}',
            "note": record["details"],
        }
        for record in records
    ]


def make_mortality_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["shed"]}',
            "value": f'{record["birds"]} birds',
            "note": record["notes"] or "No note added",
        }
        for record in records
    ]


def public_file_response(file_name: str) -> FileResponse:
    file_path = PROJECT_ROOT / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(file_path)


for route_path, file_name in WEBSITE_FILES.items():
    app.add_api_route(route_path, lambda file_name=file_name: public_file_response(file_name), methods=["GET"])


@app.get("/api/health")
def healthcheck():
    return {"status": "ok"}


@app.post("/api/farmer/login")
def farmer_login(payload: LoginPayload):
    if not payload.phone or not payload.password:
        raise HTTPException(status_code=400, detail="Phone and password are required.")

    with DATA_LOCK:
        data = load_data()
    return {
        "success": True,
        "message": "Login successful.",
        "farmer": data["profile"],
    }


@app.get("/api/farmer/profile")
def farmer_profile():
    with DATA_LOCK:
        data = load_data()
    return data["profile"]


@app.get("/api/farmer/dashboard")
def farmer_dashboard():
    with DATA_LOCK:
        data = load_data()
    profile = data["profile"]
    mortality_today = sum(
        int(item["birds"]) for item in data["mortality_log"] if item["date"] == today_string()
    )
    total_feed = sum(int(item["bags"]) for item in data["feed_stock"])
    open_requests = sum(1 for item in data["requests"] if item["status"] != "Closed")

    return {
        "profile": profile,
        "kpis": [
            {"label": "Bird age", "value": f'{profile["bird_age_days"]} days', "note": "Active batch age"},
            {"label": "Mortality today", "value": f"{mortality_today} birds", "note": "Submitted across sheds"},
            {"label": "Feed balance", "value": f"{total_feed} bags", "note": "Current stock on farm"},
            {"label": "Open requests", "value": str(open_requests), "note": "Pending operations support"},
        ],
        "batch_summary": [
            {"label": "Batch", "value": profile["active_batch"], "note": "Current cycle"},
            {"label": "Farm", "value": profile["farm_name"], "note": profile["farmer_code"]},
            {"label": "Field officer", "value": profile["field_officer"], "note": "Assigned support"},
        ],
        "tasks": [
            {"label": "Daily mortality entry", "value": "Submit before evening round"},
            {"label": "Feed inward update", "value": "Add after unloading"},
            {"label": "Medicine note", "value": "Log medicines given to birds"},
        ],
        "mortality_history": make_mortality_history(data["mortality_log"])[:5],
    }


@app.post("/api/farmer/mortality")
def add_mortality_entry(payload: MortalityPayload):
    with DATA_LOCK:
        data = load_data()
        record = {
            "date": payload.entry_date or today_string(),
            "shed": payload.shed,
            "birds": payload.birds,
            "notes": payload.notes,
        }
        data["mortality_log"].insert(0, record)
        save_data(data)
    return {"success": True, "record": record}


@app.get("/api/farmer/feed")
def farmer_feed():
    with DATA_LOCK:
        data = load_data()
    return {
        "profile": data["profile"],
        "shed_balances": make_feed_balances(data["feed_stock"]),
        "inward_history": make_feed_history(data["feed_inward"]),
    }


@app.post("/api/farmer/feed/balance")
def update_feed_balance(payload: FeedBalancePayload):
    with DATA_LOCK:
        data = load_data()
        updated = False
        for record in data["feed_stock"]:
            if record["shed"] == payload.shed and record["feed_type"] == payload.feed_type:
                record["bags"] = payload.bags
                updated = True
                break

        if not updated:
            data["feed_stock"].append(payload.model_dump())

        save_data(data)
    return {"success": True}


@app.post("/api/farmer/feed/inward")
def add_feed_inward(payload: FeedInwardPayload):
    with DATA_LOCK:
        data = load_data()
        record = {
            "date": payload.inward_date,
            "feed_type": payload.feed_type,
            "bags": payload.bags,
            "shed": payload.shed,
        }
        data["feed_inward"].insert(0, record)
        save_data(data)
    return {"success": True, "record": record}


@app.get("/api/farmer/health")
def farmer_health():
    with DATA_LOCK:
        data = load_data()
    return {
        "profile": data["profile"],
        "summary": make_medicine_summary(data["medicine_stock"]),
        "log": make_medicine_log(data["medicine_log"]),
    }


@app.post("/api/farmer/health/stock")
def update_medicine_stock(payload: MedicinePayload):
    with DATA_LOCK:
        data = load_data()
        record = {
            "name": payload.name,
            "status": payload.status,
            "quantity": payload.quantity,
            "notes": payload.notes,
        }
        data["medicine_stock"].insert(0, record)
        save_data(data)
    return {"success": True, "record": record}


@app.post("/api/farmer/health/administer")
def add_medicine_log(payload: MedicinePayload):
    with DATA_LOCK:
        data = load_data()
        record = {
            "date": payload.entry_date or today_string(),
            "name": payload.name,
            "status": payload.status,
            "quantity": payload.quantity,
            "notes": payload.notes,
        }
        data["medicine_log"].insert(0, record)
        save_data(data)
    return {"success": True, "record": record}


@app.get("/api/farmer/requests")
def farmer_requests():
    with DATA_LOCK:
        data = load_data()
    return {
        "profile": data["profile"],
        "history": make_request_history(data["requests"]),
    }


@app.post("/api/farmer/requests")
def add_request(payload: RequestPayload):
    with DATA_LOCK:
        data = load_data()
        record = {
            "date": today_string(),
            "type": payload.type,
            "priority": payload.priority,
            "details": payload.details,
            "status": "Submitted",
        }
        data["requests"].insert(0, record)
        save_data(data)
    return {"success": True, "record": record}


app.mount(
    "/farmer-app",
    StaticFiles(directory=PROJECT_ROOT / "farmer-app", html=True),
    name="farmer-app",
)
