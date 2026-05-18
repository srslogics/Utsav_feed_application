import json
import re
from datetime import datetime
from datetime import date
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_LOCK = Lock()

UPLOADS_DIR.mkdir(exist_ok=True)

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
    "/downloads/UtsavFarmerLite-debug.apk": "UtsavFarmerLite-debug.apk",
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


class DailyEntryPayload(BaseModel):
    entry_date: str
    shed: str
    opening_birds: int = Field(gt=0)
    mortality: int = Field(ge=0)
    culls: int = Field(ge=0)
    feed_used_bags: int = Field(ge=0)
    water_liters: int = Field(ge=0)
    avg_weight_g: int = Field(gt=0)
    temperature_c: float
    humidity_pct: int = Field(ge=0, le=100)
    litter_condition: str
    power_cut_hours: float = Field(ge=0)
    dg_hours: float = Field(ge=0)
    uniformity_pct: int = Field(ge=0, le=100)
    issues: str = ""
    remarks: str = ""


def ensure_data_file() -> None:
    if not DATA_FILE.exists():
        DATA_FILE.write_text(json.dumps(DEFAULT_DATA, indent=2))
    UPLOADS_DIR.mkdir(exist_ok=True)


def load_data() -> dict:
    ensure_data_file()
    return json.loads(DATA_FILE.read_text())


def save_data(data: dict) -> None:
    DATA_FILE.write_text(json.dumps(data, indent=2))


def safe_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return cleaned or "document"


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


def make_daily_entry_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["shed"]}',
            "value": f'{record["mortality"]} mortality • {record["feed_used_bags"]} feed bags',
            "note": (
                f'Water {record["water_liters"]} L • Avg wt {record["avg_weight_g"]} g • '
                f'Temp {record["temperature_c"]} C'
            ),
        }
        for record in records
    ]


def make_vaccine_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["shed"]} / {record["vaccine"]}',
            "value": record["status"],
            "note": record["notes"],
        }
        for record in records
    ]


def make_document_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["type"]}',
            "value": record["status"],
            "note": (
                f'{record["title"]} • {record["amount"] or "No amount"} • '
                f'File: {record["file_name"]}'
            ),
        }
        for record in records
    ]


def make_issue_photo_history(records: list[dict]) -> list[dict]:
    return [
        {
            "label": f'{record["date"]} / {record["issue_type"]} / {record["shed"]}',
            "value": record["status"],
            "note": f'{record["priority"]} priority • {record["notes"]} • File: {record["file_name"]}',
        }
        for record in records
    ]


def build_owner_alerts(daily_entries: list[dict], requests: list[dict], vaccine_log: list[dict]) -> list[dict]:
    alerts: list[dict] = []

    for record in daily_entries[:4]:
        if record["mortality"] >= 15:
            alerts.append(
                {
                    "label": f'{record["shed"]} mortality watch',
                    "value": f'{record["mortality"]} birds',
                    "note": f'{record["date"]} entry needs review',
                }
            )
        if record["temperature_c"] >= 31:
            alerts.append(
                {
                    "label": f'{record["shed"]} temperature high',
                    "value": f'{record["temperature_c"]} C',
                    "note": "Ventilation and cooling check advised",
                }
            )
        if record["power_cut_hours"] >= 2:
            alerts.append(
                {
                    "label": f'{record["shed"]} power interruption',
                    "value": f'{record["power_cut_hours"]} hrs',
                    "note": "Monitor DG usage and bird stress",
                }
            )

    for request in requests[:3]:
        if request["status"] != "Closed":
            alerts.append(
                {
                    "label": request["type"],
                    "value": request["status"],
                    "note": request["details"],
                }
            )

    for vaccine in vaccine_log[:3]:
        if vaccine["status"] == "Due":
            alerts.append(
                {
                    "label": f'Vaccine due in {vaccine["shed"]}',
                    "value": vaccine["vaccine"],
                    "note": vaccine["date"],
                }
            )

    return alerts[:6]


def build_performance_metrics(daily_entries: list[dict]) -> list[dict]:
    if not daily_entries:
        return []

    latest_by_shed: dict[str, dict] = {}
    for record in daily_entries:
        if record["shed"] not in latest_by_shed:
            latest_by_shed[record["shed"]] = record

    total_feed_bags = sum(float(record["feed_used_bags"]) for record in daily_entries)
    total_feed_kg = total_feed_bags * 50
    placement_birds = sum(float(record["opening_birds"]) for record in latest_by_shed.values())
    current_live_birds = sum(
        float(record["opening_birds"]) - float(record["mortality"]) - float(record["culls"])
        for record in latest_by_shed.values()
    )
    total_mortality = sum(float(record["mortality"]) for record in daily_entries)
    total_culls = sum(float(record["culls"]) for record in daily_entries)

    weighted_live_weight_kg = sum(
        (
            (float(record["opening_birds"]) - float(record["mortality"]) - float(record["culls"]))
            * float(record["avg_weight_g"])
        )
        / 1000
        for record in latest_by_shed.values()
    )
    avg_weight_g = (
        sum(float(record["avg_weight_g"]) for record in latest_by_shed.values()) / len(latest_by_shed)
        if latest_by_shed
        else 0
    )
    livability = ((current_live_birds / placement_birds) * 100) if placement_birds else 0
    running_fcr = (total_feed_kg / weighted_live_weight_kg) if weighted_live_weight_kg else 0
    feed_per_bird_kg = (total_feed_kg / current_live_birds) if current_live_birds else 0

    return [
        {
            "label": "Running FCR",
            "value": f"{running_fcr:.2f}",
            "note": "Estimated from submitted cycle feed and current live weight",
        },
        {
            "label": "Livability",
            "value": f"{livability:.1f}%",
            "note": f"{int(current_live_birds):,} live birds from {int(placement_birds):,} placed",
        },
        {
            "label": "Feed consumed",
            "value": f"{total_feed_kg:,.0f} kg",
            "note": f"{total_feed_bags:,.0f} total bags recorded in cycle",
        },
        {
            "label": "Current live weight",
            "value": f"{weighted_live_weight_kg:,.0f} kg",
            "note": f"Average body weight {avg_weight_g:,.0f} g",
        },
        {
            "label": "Feed per bird",
            "value": f"{feed_per_bird_kg:.2f} kg",
            "note": f"Mortality {int(total_mortality):,} • culls {int(total_culls):,}",
        },
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
    today_entries = [item for item in data["daily_entries"] if item["date"] == today_string()]
    if not today_entries and data["daily_entries"]:
        latest_date = data["daily_entries"][0]["date"]
        today_entries = [item for item in data["daily_entries"] if item["date"] == latest_date]
    mortality_today = sum(int(item["mortality"]) for item in today_entries)
    total_feed = sum(int(item["bags"]) for item in data["feed_stock"])
    open_requests = sum(1 for item in data["requests"] if item["status"] != "Closed")
    current_birds = sum(
        int(item["opening_birds"]) - int(item["mortality"]) - int(item["culls"])
        for item in today_entries
    )
    latest_entry = data["daily_entries"][0] if data["daily_entries"] else None

    return {
        "profile": profile,
        "kpis": [
            {"label": "Bird age", "value": f'{profile["bird_age_days"]} days', "note": "Active batch age"},
            {"label": "Live birds", "value": f"{current_birds:,}", "note": "Based on today’s shed entries"},
            {"label": "Mortality today", "value": f"{mortality_today} birds", "note": "Submitted across sheds"},
            {"label": "Feed balance", "value": f"{total_feed} bags", "note": "Current stock on farm"},
            {"label": "Open requests", "value": str(open_requests), "note": "Pending operations support"},
        ],
        "batch_summary": [
            {"label": "Batch", "value": profile["active_batch"], "note": "Current cycle"},
            {"label": "Farm", "value": profile["farm_name"], "note": profile["farmer_code"]},
            {"label": "Capacity", "value": profile["farm_capacity"], "note": f'{profile["active_sheds"]} active sheds'},
            {"label": "Field officer", "value": profile["field_officer"], "note": "Assigned support"},
        ],
        "tasks": [
            {"label": "Daily farm entry", "value": "Submit birds, feed, water, and environment data"},
            {"label": "Feed inward update", "value": "Add after unloading"},
            {"label": "Medicine note", "value": "Log medicines given to birds"},
            {"label": "Support issues", "value": "Raise any shed or utility issue immediately"},
        ],
        "mortality_history": make_mortality_history(data["mortality_log"])[:5],
        "owner_alerts": build_owner_alerts(data["daily_entries"], data["requests"], data["vaccination_log"]),
        "performance_metrics": build_performance_metrics(data["daily_entries"]),
        "latest_daily_entry": (
            [
                {"label": "Date", "value": latest_entry["date"], "note": "Latest submission"},
                {"label": "Shed", "value": latest_entry["shed"], "note": "Most recent entry shed"},
                {"label": "Feed used", "value": f'{latest_entry["feed_used_bags"]} bags', "note": "Daily feed consumption"},
                {"label": "Water", "value": f'{latest_entry["water_liters"]} L', "note": "Daily water intake"},
                {"label": "Avg weight", "value": f'{latest_entry["avg_weight_g"]} g', "note": "Current body weight"},
                {"label": "Litter", "value": latest_entry["litter_condition"], "note": latest_entry["issues"]},
            ]
            if latest_entry
            else []
        ),
    }


@app.get("/api/farmer/daily-entry")
def farmer_daily_entry():
    with DATA_LOCK:
        data = load_data()

    return {
        "profile": data["profile"],
        "entry_history": make_daily_entry_history(data["daily_entries"]),
        "vaccine_history": make_vaccine_history(data["vaccination_log"]),
    }


@app.post("/api/farmer/daily-entry")
def add_daily_entry(payload: DailyEntryPayload):
    with DATA_LOCK:
        data = load_data()
        record = {
            "date": payload.entry_date,
            "shed": payload.shed,
            "opening_birds": payload.opening_birds,
            "mortality": payload.mortality,
            "culls": payload.culls,
            "feed_used_bags": payload.feed_used_bags,
            "water_liters": payload.water_liters,
            "avg_weight_g": payload.avg_weight_g,
            "temperature_c": payload.temperature_c,
            "humidity_pct": payload.humidity_pct,
            "litter_condition": payload.litter_condition,
            "power_cut_hours": payload.power_cut_hours,
            "dg_hours": payload.dg_hours,
            "uniformity_pct": payload.uniformity_pct,
            "issues": payload.issues,
            "remarks": payload.remarks,
        }
        data["daily_entries"].insert(0, record)
        save_data(data)
    return {"success": True, "record": record}


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
        "vaccines": make_vaccine_history(data["vaccination_log"]),
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
        "documents": make_document_history(data["documents"]),
        "issue_photos": make_issue_photo_history(data["issue_photos"]),
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


@app.post("/api/farmer/documents")
async def upload_document(
    doc_type: str = Form(...),
    title: str = Form(...),
    amount: str = Form(""),
    notes: str = Form(""),
    file: UploadFile = File(...),
):
    ensure_data_file()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    original_name = file.filename or "document"
    suffix = Path(original_name).suffix or ".bin"
    stored_name = f"{timestamp}-{safe_slug(title)}{suffix}"
    destination = UPLOADS_DIR / stored_name
    content = await file.read()
    destination.write_bytes(content)

    record = {
        "date": today_string(),
        "type": doc_type,
        "title": title,
        "amount": amount,
        "notes": notes,
        "file_name": original_name,
        "stored_name": stored_name,
        "status": "Submitted to owner system",
    }

    with DATA_LOCK:
        data = load_data()
        data.setdefault("documents", [])
        data["documents"].insert(0, record)
        save_data(data)

    return {"success": True, "record": record}


@app.post("/api/farmer/issues/photo")
async def upload_issue_photo(
    issue_type: str = Form(...),
    shed: str = Form(...),
    priority: str = Form(...),
    notes: str = Form(""),
    file: UploadFile = File(...),
):
    ensure_data_file()
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    original_name = file.filename or "issue-photo"
    suffix = Path(original_name).suffix or ".bin"
    stored_name = f"{timestamp}-{safe_slug(issue_type)}{suffix}"
    destination = UPLOADS_DIR / stored_name
    content = await file.read()
    destination.write_bytes(content)

    record = {
        "date": today_string(),
        "issue_type": issue_type,
        "shed": shed,
        "priority": priority,
        "notes": notes,
        "file_name": original_name,
        "stored_name": stored_name,
        "status": "Shared with owner system",
    }

    with DATA_LOCK:
        data = load_data()
        data.setdefault("issue_photos", [])
        data["issue_photos"].insert(0, record)
        save_data(data)

    return {"success": True, "record": record}


app.mount(
    "/farmer-app",
    StaticFiles(directory=PROJECT_ROOT / "farmer-app", html=True),
    name="farmer-app",
)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
