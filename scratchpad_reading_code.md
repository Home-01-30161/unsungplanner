# 📝 Scratchpad: วิธีอ่านโค้ดให้เข้าใจทั้งโปรเจกต์

---

## 🧠 หลักคิดก่อนอ่าน

> **อย่าอ่านทุกบรรทัด** — อ่านเพื่อตอบคำถาม
> คำถามที่ต้องตอบให้ได้คือ:
> 1. ข้อมูลชิ้นนี้ **มาจากไหน**?
> 2. ข้อมูลชิ้นนี้ **ไปที่ไหน**?
> 3. ไฟล์นี้ **ทำหน้าที่อะไร** ในระบบ?

---

## 🗺️ ขั้นตอนอ่านโค้ด (ทำตามลำดับ)

### Step 1 — ดูภาพรวมก่อน (5 นาที)

```
1. เปิด package.json
   → ดู dependencies ว่าใช้ library อะไรบ้าง
   → ดู scripts ว่า run ยังไง

2. ดู folder structure
   src/
   ├── app/        → UI + API endpoints
   ├── lib/        → Business logic
   └── data/       → Static data files
```

**คำถามหลัง Step 1:**
- โปรเจกต์นี้ใช้ Framework อะไร? → Next.js
- ใช้ AI library อะไร? → LangGraph + OpenAI
- เก็บ data ที่ไหน? → Supabase + local JSON

---

### Step 2 — อ่าน Types ก่อน (10 นาที)

📄 **`src/lib/types.ts`** และ **`src/lib/schema.ts`**

**วิธีอ่าน:**
```
สำหรับแต่ละ type ให้ถามว่า:
"ข้อมูลแบบนี้ใช้ทำอะไรในระบบ?"

FlightQuote    → ผลลัพธ์จากการค้นหาตั๋ว
HotelQuote     → ผลลัพธ์จากการค้นหาโรงแรม
Budget         → สรุปค่าใช้จ่ายทั้งหมด
BudgetLine     → แต่ละรายการในบิล
WeatherSummary → สรุปสภาพอากาศ
```

**ถ้าเจอ Syntax ไม่เข้าใจ:**
```ts
// ? หลัง field = optional (มีหรือไม่มีก็ได้)
via?: string

// | = union (อันใดอันหนึ่ง)
amountUSD: number | null

// as const = ห้ามเปลี่ยน array นี้
const MODES = ["fly", "drive"] as const

// [number] = union ทุก element ใน array
type Mode = (typeof MODES)[number]  // = "fly" | "drive"
```

---

### Step 3 — ตาม Flow ของ Request (30 นาที)

> เริ่มจาก **จุดที่ผู้ใช้กดปุ่ม** แล้วตามไปทีละขั้น

```
📍 จุดเริ่ม: src/app/page.tsx
   → หา: fetch("/api/plan")  ← ตรงนี้คือส่ง request
   → หา: for await           ← ตรงนี้คือรับ stream กลับ

📍 ผ่าน: src/app/api/plan/route.ts
   → บรรทัด 12: PlanRequest.safeParse()  ← ตรวจ input
   → บรรทัด 16: takeDailyPlanSlot()      ← เช็ค quota
   → บรรทัด 27: travelWorkflow.stream()  ← รัน AI

📍 เข้า: src/lib/agents/travelGraph.ts
   → บรรทัด 222-235: ดู graph structure ก่อน
   → แล้วค่อยดู function แต่ละ node
```

**วาด Flow ง่ายๆ ในใจ:**
```
User กดปุ่ม
    ↓
page.tsx → POST /api/plan
    ↓
route.ts → validate → เรียก travelGraph
    ↓
travelGraph.ts → รัน nodes ทีละขั้น
    ↓
stream ผลกลับ → page.tsx แสดงผล
```

---

### Step 4 — อ่าน Node แต่ละตัวใน travelGraph.ts

**วิธีอ่านแต่ละ node:**
```
1. ดู Input: node รับ state อะไร? (s.originCity, s.nights ...)
2. ดู Process: ทำอะไร? (ยิง API? คำนวณ? ถาม LLM?)
3. ดู Output: return อะไร? (ข้อมูลอะไรเพิ่มเข้า state)
4. ดู Error: ถ้า fail คืน gaps ว่าอะไร?
```

**ลำดับ nodes:**
```
geocode_cities   → แปลงชื่อเมือง → lat/lng
    ↓ (parallel)
find_logistics   → ค้นตั๋ว/โรงแรม/ระยะทาง
find_research    → ค้นเว็บหา attraction/restaurant
find_weather     → ดึง forecast + วันหยุด
    ↓ (รอทุกตัว)
calc_budget      → คำนวณเงินรวม
    ↓
write_itinerary  → ให้ LLM เขียนแผนการเดินทาง
```

---

### Step 5 — อ่าน Connector แต่ละตัว

**วิธีอ่าน connector:**
```
1. ดู API ปลายทาง (ใช้ fetch ไปที่ URL ไหน?)
2. ดู Input (รับ city? lat/lng? date?)
3. ดู Output (return type คืออะไร?)
4. ดู Cache (TTL นานแค่ไหน? ทำไม?)
5. ดู Fallback (ถ้า API fail → return null?)
```

**ตัวอย่าง routing.ts:**
```ts
// Input: สองจุด lat/lng
// Process: ยิง OpenRouteService API
// Output: ระยะทาง km หรือ null
// Cache: 30 วัน (เส้นทางไม่ค่อยเปลี่ยน)
// Fallback: return null ถ้าไม่มี API key
```

---

## 🔍 เทคนิคอ่านโค้ดเร็ว

### เทคนิค 1: อ่าน Signature ก่อน ไม่ต้องอ่านข้างใน
```ts
// อ่านแค่บรรทัดนี้ก็รู้แล้วว่า function ทำอะไร
async function getDrivingDistanceKm(
    from: { lat: number; lng: number },  // รับจุดเริ่ม
    to: { lat: number; lng: number }     // รับจุดปลาย
): Promise<number | null>                // คืนระยะทาง km
```

### เทคนิค 2: อ่าน return statement ก่อน
```ts
// กระโดดไปดู return ก่อน แล้วค่อยย้อนกลับมาดูว่าได้มายังไง
return { flight, hotel, drivingKm, gaps };
// → รู้ว่า function นี้ทำเรื่อง logistics
```

### เทคนิค 3: อ่าน comment ที่ขึ้นต้นด้วย //
```ts
/** Node 1: flights, hotels, driving distance. */
// อ่าน JSDoc comment → รู้หน้าที่ทันที
```

### เทคนิค 4: ถ้าเจอ Promise.all — แปลว่าทำพร้อมกัน
```ts
const [flight, hotel, drivingKm] = await Promise.all([
    searchFlights(...),  // ← 3 อันนี้รันพร้อมกัน
    searchHotels(...),
    getDrivingDistanceKm(...)
]);
```

### เทคนิค 5: ถ้าเจอ try/catch — แปลว่า API อาจ fail
```ts
try {
    const res = await fetch(url);
    return data;
} catch {
    return null;  // ← fail gracefully
}
```

---

## 📖 Keyword Glossary (คำศัพท์ที่เจอบ่อย)

| Keyword | ความหมาย |
|---|---|
| `async/await` | รอผลก่อนทำต่อ (เรียก API) |
| `Promise.all` | รันหลายอย่างพร้อมกัน |
| `export` | ให้ไฟล์อื่น import ได้ |
| `import type` | import เฉพาะ type (หายตอนรัน) |
| `as const` | ห้ามเปลี่ยน array/object |
| `?:` | field นี้ optional |
| `| null` | อาจเป็น null ได้ |
| `as Type` | บอก TypeScript ว่า type คืออะไร |
| `z.object()` | Zod schema สำหรับ object |
| `.safeParse()` | ตรวจข้อมูลตอนรัน (ไม่ throw) |
| `Annotation.Root` | กำหนด State ของ LangGraph |
| `StateGraph` | สร้าง AI workflow |
| `.addEdge` | เชื่อม node ใน graph |
| `ReadableStream` | ส่งข้อมูลแบบ stream |
| `for await...of` | วนรับ stream ทีละชิ้น |

---

## ❓ คำถามที่ควรตอบได้หลังอ่านจบ

- [ ] ผู้ใช้ต้องกรอกอะไรบ้างเพื่อสร้าง trip plan?
- [ ] มีกี่ nodes ใน AI agent? แต่ละตัวทำอะไร?
- [ ] Node ไหนรัน parallel? Node ไหนรอตามลำดับ?
- [ ] ถ้า API ภายนอกล่ม ระบบจะพังไหม? ทำไม?
- [ ] Cache ทำงานยังไง? ถ้าไม่มี Supabase จะเกิดอะไร?
- [ ] Zod ใช้ทำอะไร? ต่างจาก TypeScript type ยังไง?
- [ ] ทำไม response ส่งกลับแบบ stream ไม่ใช่ JSON ก้อนเดียว?
- [ ] API key เก็บที่ไหน? ปลอดภัยจาก user ยังไง?

---

## 🗂️ Quick Reference — ไฟล์สำคัญ

```
types.ts          → รูปร่างของข้อมูลทั้งหมด
schema.ts         → ตรวจ input จากผู้ใช้ (Zod)
cache.ts          → บันทึกผล API ชั่วคราว (Supabase)
budget.ts         → คำนวณค่าใช้จ่าย
dates.ts          → helper วันที่

connectors/
  routing.ts      → ระยะทางขับรถ
  weather.ts      → พยากรณ์อากาศ
  holidays.ts     → วันหยุดราชการ
  currency.ts     → อัตราแลกเปลี่ยน
  research.ts     → ค้นเว็บด้วย Tavily AI
  travelData.ts   → ตั๋วเครื่องบิน + โรงแรม (SerpAPI)
  geocode.ts      → ชื่อเมือง → lat/lng
  citySearch.ts   → autocomplete ชื่อเมือง

agents/
  travelGraph.ts  → AI workflow ทั้งหมด ⭐

app/
  page.tsx        → UI หลัก
  api/plan/       → รับ request → รัน agent → stream กลับ
  api/cities/     → autocomplete endpoint
```
