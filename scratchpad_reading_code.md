# 📝 Scratchpad: วิธีอ่านและทำความเข้าใจ Codebase ทั้งหมดของ Unsung Planner

เอกสารนี้เป็นคู่มือสรุปสถาปัตยกรรม (Architecture) และ Roadmap ในการอ่านทำความเข้าใจโค้ดในโปรเจกต์นี้ทั้งหมดอย่างเป็นระบบ

---

## 🧠 1. หลักคิดก่อนอ่าน (The Mental Model)

> **อย่าอ่านโค้ดเรียงบรรทัด** — ให้อ่านตาม **Data Flow** (การไหลของข้อมูล)
> คำถาม 3 ข้อที่ต้องตอบให้ได้ในแต่ละส่วน:
> 1. ข้อมูลนี้ **มาจากไหน**? (Input จาก User หรือ API ภายนอก)
> 2. ใครเป็นคน **ประมวลผล**? (คำนวณด้วยโค้ด หรือส่งให้ LLM เขียน)
> 3. ข้อมูลนี้ **ส่งไปที่ไหนต่อ**? (ลง Database, เข้า Cache หรือ Stream กลับไปหน้าเว็บ)

---

## 🗺️ 2. ภาพรวมสถาปัตยกรรม (System Architecture)

```
[ผู้ใช้ใน Browser]
       │
       ▼  (POST /api/plan พร้อม Turnstile Token)
[src/app/api/plan/route.ts]
       │
       ├─► ตรวจสอบ Input ด้วย Zod (src/lib/schema.ts)
       ├─► ตรวจสอบ Captcha & Client IP (src/lib/security.ts)
       ├─► ตรวจสอบโควตา / Rate Limit (src/lib/cache.ts -> Supabase)
       │
       ▼  (เรียก travelWorkflow.stream)
[src/lib/agents/travelGraph.ts]  <-- AI Workflow (LangGraph)
       │
       ├─► Node 0: geocode_cities    (แปลงชื่อเมือง -> พิกัด & สนามบิน)
       │       │
       │       ├─► [Parallel] Node 1: find_logistics (ตั๋วเครื่องบิน/โรงแรม/ขับรถ)
       │       ├─► [Parallel] Node 2: find_research  (Tavily ค้นที่เที่ยว/ร้านอาหาร)
       │       └─► [Parallel] Node 3: find_weather   (พยากรณ์อากาศ + วันหยุดราชการ)
       │               │
       ├─► Node 4: calc_budget       (คำนวณเงินรวมด้วยสูตรคณิตศาสตร์ล้วน ไม่ใช้ LLM)
       │       │
       └─► Node 5: write_itinerary   (ส่งข้อมูลทั้งหมดให้ LLM สรุปเป็นแผนการเดินทาง)
               │
               ▼  (NDJSON Streaming ตอบกลับทันทีที่แต่ละ Node เสร็จ)
[src/app/page.tsx แสดงผลบนหน้าจอแบบ Real-time]
```

---

## 🗂️ 3. แผนที่นำทางไฟล์สำคัญ (File Directory Map)

### ก้อนที่ 1: Frontend & User Entrypoint
- [`src/app/page.tsx`](file:///d:/unsungplanner/src/app/page.tsx)
  - หน้า UI หลัก เขียนด้วย React 19 + Tailwind CSS
  - มีฟอร์มเลือกเมืองแบบ Auto-complete (`CityPicker`), ช่องกรอกงบประมาณ และตัวเลือกการเดินทาง
  - ฟังก์ชัน `handleSubmit` จะยิง `fetch('/api/plan')` และอ่าน Stream ด้วย `ReadableStreamDefaultReader`
  - มีฟังก์ชัน `safeHref()` ป้องกัน XSS จากลิงก์ภายนอก

### ก้อนที่ 2: API Gateway & Security
- [`src/app/api/plan/route.ts`](file:///d:/unsungplanner/src/app/api/plan/route.ts)
  - จุดรับ Request หลัก มีระบบป้องกัน 3 ชั้น:
    1. ตรวจสอบขนาด Body ป้องกัน Payload เกิน 16KB
    2. ตรวจสอบ Cloudflare Turnstile Captcha
    3. ตรวจสอบ Rate Limit ต่อ IP (5 ครั้ง/ชม.) และโควตารวมทั้งระบบ (100 ครั้ง/วัน)
  - ส่งข้อมูลผลลัพธ์กลับแบบ NDJSON (Newline Delimited JSON)
- [`src/lib/security.ts`](file:///d:/unsungplanner/src/lib/security.ts)
  - รวมฟังก์ชันความปลอดภัย: `clientIp()` (ดึง IP ผ่าน Cloudflare/Vercel header), `verifyTurnstile()`, `scrubSecrets()` (ลบ API key ออกจาก Log)
- [`next.config.ts`](file:///d:/unsungplanner/next.config.ts)
  - ตั้งค่าความปลอดภัยของ Web Server เช่น CSP (Content Security Policy), HSTS, X-Frame-Options

### ก้อนที่ 3: The Core AI Agent (สมองกล)
- [`src/lib/agents/travelGraph.ts`](file:///d:/unsungplanner/src/lib/agents/travelGraph.ts)
  - **ไฟล์ที่สำคัญที่สุดในโปรเจกต์**
  - ใช้ **LangGraph** สร้าง State Machine โดยมี State กลางชื่อ `TravelState`
  - มี 6 Nodes: `geocode` -> `logistics`, `research`, `weather` (รันขนานกัน) -> `budget` -> `writer`
  - มี Prompt สั่ง LLM ในฟังก์ชัน `writer()` ให้เขียนแผนการเดินทางแบบ Bullet พร้อมใส่ Citation `[1]`, `[2]`

### ก้อนที่ 4: Connectors (ตัวเชื่อมต่อโลกภายนอก)
- [`src/lib/connectors/geocode.ts`](file:///d:/unsungplanner/src/lib/connectors/geocode.ts): แปลงชื่อเมืองเป็นพิกัด และสแกนหารหัสสนามบิน IATA ในรัศมี 200 กม.
- [`src/lib/connectors/travelData.ts`](file:///d:/unsungplanner/src/lib/connectors/travelData.ts): ค้นหาราคาตั๋วเครื่องบินและโรงแรมผ่าน SerpAPI (Google Flights/Hotels)
- [`src/lib/connectors/routing.ts`](file:///d:/unsungplanner/src/lib/connectors/routing.ts): คำนวณระยะทางขับรถผ่าน OpenRouteService
- [`src/lib/connectors/research.ts`](file:///d:/unsungplanner/src/lib/connectors/research.ts): ค้นเว็บหาที่เที่ยวและร้านอาหารผ่าน Tavily
- [`src/lib/connectors/weather.ts`](file:///d:/unsungplanner/src/lib/connectors/weather.ts): ดึงพยากรณ์อากาศผ่าน Open-Meteo
- [`src/lib/connectors/holidays.ts`](file:///d:/unsungplanner/src/lib/connectors/holidays.ts): ดึงวันหยุดราชการผ่าน Nager.Date
- [`src/lib/connectors/currency.ts`](file:///d:/unsungplanner/src/lib/connectors/currency.ts): แปลงอัตราแลกเปลี่ยนเงินตรา

### ก้อนที่ 5: Data & Database Support
- [`src/lib/cache.ts`](file:///d:/unsungplanner/src/lib/cache.ts): แคชผลลัพธ์ของ API เพื่อประหยัดเงิน และควบคุม Quota ผ่านฟังก์ชัน `take_slot` ใน Supabase
- [`src/lib/budget.ts`](file:///d:/unsungplanner/src/lib/budget.ts): โค้ดคำนวณงบประมาณ (ไม่ใช้ AI คำนวณ เพื่อความถูกต้อง 100%)
- [`supabase/migrations/20261023_security.sql`](file:///d:/unsungplanner/supabase/migrations/20261023_security.sql): ตารางฐานข้อมูล PostgreSQL และ Stored Procedure แบบ Atomic สำหรับควบคุม Quota

---

## ⏱️ 4. แนะนำขั้นตอนการอ่านตามลำดับเวลา (45 นาที)

1. **นาทีที่ 0 - 5 (Data Shape)**:
   - เปิด [`src/lib/types.ts`](file:///d:/unsungplanner/src/lib/types.ts) เพื่อดูว่า Object ในระบบมีหน้าตาอย่างไร (`FlightQuote`, `HotelQuote`, `Budget`)
2. **นาทีที่ 5 - 15 (Request Flow)**:
   - เปิด [`src/app/api/plan/route.ts`](file:///d:/unsungplanner/src/app/api/plan/route.ts) ไล่ดูตั้งแต่รับ Request ตรวจสอบความปลอดภัย จนถึงคำสั่งเรียก `travelWorkflow.stream()`
3. **นาทีที่ 15 - 30 (Graph Workflow)**:
   - เปิด [`src/lib/agents/travelGraph.ts`](file:///d:/unsungplanner/src/lib/agents/travelGraph.ts)
   - เลื่อนไปล่างสุดดูโครงสร้าง Graph (บรรทัด 222-236)
   - ดูฟังก์ชันของแต่ละ Node ว่ารับ Input อะไร และส่ง Output อะไรเข้าสู่ State
4. **นาทีที่ 30 - 40 (Connectors & Caching)**:
   - เปิดดูตัวอย่าง Connector เช่น [`src/lib/connectors/travelData.ts`](file:///d:/unsungplanner/src/lib/connectors/travelData.ts) เพื่อดูวิธีเรียก API ภายนอกและการแคชผลลัพธ์
5. **นาทีที่ 40 - 45 (Frontend Consumer)**:
   - เปิด [`src/app/page.tsx`](file:///d:/unsungplanner/src/app/page.tsx) ดูฟังก์ชัน `applyEvent` และการเรนเดอร์ Itinerary

---

## 💡 จุดเด่นทางเทคนิคที่ควรจดจำ
- **Zero-Hallucination Pricing**: แยกการคำนวณราคาออกจาก LLM โดยสิ้นเชิง
- **Stream-First UX**: ผู้ใช้ไม่ต้องรอโหลด 30 วินาที แต่จะเห็น Progress ขยับทีละ Node ทันทีที่ API แต่ละตัวทำงานเสร็จ
- **Frugal API Design**: มีระบบ Caching และจำกัดจำนวนการเรียกภายนอกอย่างเคร่งครัดเพื่อประหยัดต้นทุน Free Tier
