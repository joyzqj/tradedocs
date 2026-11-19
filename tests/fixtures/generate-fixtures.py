#!/usr/bin/env python3
"""Generate QA fixtures for tests/test-recognize.mjs.

Run with the bundled Office Python (python-docx + openpyxl available):
  "C:/Users/Administrator/AppData/Local/Programs/DSH Desktop/resources/office-runtime/primary-runtime/dependencies/python/python.exe" \
      tests/fixtures/generate-fixtures.py

Outputs (committed under tests/fixtures/):
  order-sample.docx     English order/invoice with a real Word table (items)
  order-cn.docx         Chinese-labelled order with table
  items-sample.xlsx     Excel workbook: key/value rows + item table (2 sheets)
  damaged.docx          not a ZIP (corruption warning path)
  damaged.xlsx          not a ZIP (corruption warning path)
  fake-image.png        minimal valid PNG (unsupported-format path)
  fake-scan.pdf         minimal PDF header (unsupported-format path)
  legacy.doc / legacy.xls  old binary format stubs (unsupported-format path)
  text/order-sample.txt
  text/items-sample.csv
  text/items-sample.tsv
  text/order-sample.json
"""
import json
import os
import struct
import zlib

from docx import Document
from openpyxl import Workbook

ROOT = os.path.dirname(os.path.abspath(__file__))
TEXT_DIR = os.path.join(ROOT, "text")


def ensure_dirs():
    os.makedirs(TEXT_DIR, exist_ok=True)


def write_bytes(name, data):
    path = os.path.join(ROOT, name)
    with open(path, "wb") as fh:
        fh.write(data)
    print("wrote", os.path.relpath(path, ROOT), len(data), "bytes")


def build_order_docx(path, chinese=False):
    doc = Document()
    if chinese:
        lines = [
            ("形式发票 / PROFORMA INVOICE", False),
            ("发票号: PI-2026-0088        日期: 2026-11-17", False),
            ("订单号: SO-2026-0118        合同号: SC-2026-0042", False),
            ("买方: ATLANTIC HOME GOODS LLC", False),
            ("350 Fifth Avenue, Suite 2100", False),
            ("New York, NY 10118", False),
            ("United States", False),
            ("联系人: Michael Reed    电话: +1 212 555 0148", False),
            ("付款方式: BY IRREVOCABLE L/C AT SIGHT", False),
            ("信用证号: LC26USA0091    开证日期: 2026-11-07", False),
            ("开证行: JPMORGAN CHASE BANK, N.A., NEW YORK", False),
            ("贸易术语: CIF    币种: USD", False),
            ("起运港: NINGBO, CHINA    目的港: LOS ANGELES, USA", False),
            ("目的国: UNITED STATES", False),
            ("船名: OOCL SUNRISE    航次: 026E", False),
            ("开船日期: 2026-12-10    到港日期: 2026-12-24", False),
            ("唛头: ATLANTIC HOME GOODS", False),
        ]
        headers = ["品名", "HS编码", "数量", "单位", "单价", "金额"]
        rows = [
            ["陶瓷马克杯 12 盎司", "6912.00.00", "2,400", "PCS", "1.85", "4,440.00"],
            ["竹制砧板三件套", "4419.19.00", "1,200", "SET", "6.40", "7,680.00"],
            ["双层不锈钢保温杯 500ml", "7323.93.00", "3,600", "PCS", "3.25", "11,700.00"],
        ]
    else:
        lines = [
            ("PROFORMA INVOICE", False),
            ("PI No.: PI-2026-0088        Date: 2026-11-17", False),
            ("Order No.: SO-2026-0118     Contract No.: SC-2026-0042", False),
            ("Customer PO No.: AH-26-0442", False),
            ("Buyer: ATLANTIC HOME GOODS LLC", False),
            ("350 Fifth Avenue, Suite 2100", False),
            ("New York, NY 10118", False),
            ("United States", False),
            ("Contact: Michael Reed    Tel: +1 212 555 0148    Email: purchasing@atlantichome.example", False),
            ("Payment: BY IRREVOCABLE L/C AT SIGHT", False),
            ("L/C No.: LC26USA0091        L/C Date: 2026-11-07", False),
            ("Issuing Bank: JPMORGAN CHASE BANK, N.A., NEW YORK", False),
            ("Incoterm: CIF LOS ANGELES", False),
            ("Currency: USD", False),
            ("Port of Loading: NINGBO, CHINA", False),
            ("Port of Discharge: LOS ANGELES, USA", False),
            ("Final Destination: LOS ANGELES, CA, USA", False),
            ("Country of Destination: UNITED STATES", False),
            ("Vessel: OOCL SUNRISE      Voyage: 026E", False),
            ("ETD: 2026-12-10        ETA: 2026-12-24", False),
            ("Container No.: OOLU1234567      Seal No.: CN8844221", False),
            ("Shipping Marks:", False),
            ("ATLANTIC HOME GOODS", False),
            ("PO NO.: AH-26-0442", False),
            ("C/NO.: 1-390", False),
            ("MADE IN CHINA", False),
        ]
        headers = ["Description", "HS Code", "Qty", "Unit", "Unit Price", "Amount"]
        rows = [
            ["Ceramic Mug 12 oz", "6912.00.00", "2,400", "PCS", "1.85", "4,440.00"],
            ["Bamboo Cutting Board Set", "4419.19.00", "1,200", "SET", "6.40", "7,680.00"],
            ["Double-wall Steel Bottle 500 ml", "7323.93.00", "3,600", "PCS", "3.25", "11,700.00"],
        ]
    for text, _ in lines:
        doc.add_paragraph(text)
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    for i, header in enumerate(headers):
        table.cell(0, i).text = header
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            table.cell(r, c).text = value
    doc.add_paragraph("Freight / 海运费: USD 2,150.00")
    doc.add_paragraph("Insurance / 保险费: USD 340.00")
    doc.add_paragraph("Remarks / 备注:")
    doc.add_paragraph("PLEASE QUOTE OUR ORDER NO. SO-2026-0118 ON ALL DOCUMENTS.")
    doc.save(path)
    print("wrote", os.path.relpath(path, ROOT))


def build_items_xlsx(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Order"
    kv = [
        ["PROFORMA INVOICE"],
        ["PI No.", "PI-2026-0088", "Date", "2026-11-17"],
        ["Order No.", "SO-2026-0118", "Contract No.", "SC-2026-0042"],
        ["Buyer", "ATLANTIC HOME GOODS LLC"],
        ["350 Fifth Avenue, Suite 2100"],
        ["New York, NY 10118"],
        ["United States"],
        ["Payment", "BY IRREVOCABLE L/C AT SIGHT"],
        ["L/C No.", "LC26USA0091", "L/C Date", "2026-11-07"],
        ["Incoterm", "CIF", "Currency", "USD"],
        ["Port of Loading", "NINGBO, CHINA", "Port of Discharge", "LOS ANGELES, USA"],
        ["Country of Destination", "UNITED STATES"],
        ["Vessel", "OOCL SUNRISE", "Voyage", "026E"],
        ["ETD", "2026-12-10", "ETA", "2026-12-24"],
        ["Shipping Marks", "ATLANTIC HOME GOODS / PO NO.: AH-26-0442 / C/NO.: 1-390"],
        [],
        ["Description", "HS Code", "Qty", "Unit", "Unit Price", "Amount", "Cartons", "N.W.(kg)", "G.W.(kg)", "CBM"],
    ]
    for row in kv:
        ws.append(row)
    rows = [
        ["Ceramic Mug 12 oz", "6912.00.00", 2400, "PCS", 1.85, 4440.00, 100, 8, 9.2, 0.035],
        ["Bamboo Cutting Board Set", "4419.19.00", 1200, "SET", 6.40, 7680.00, 100, 11.5, 13, 0.06],
        ["Double-wall Steel Bottle 500 ml", "7323.93.00", 3600, "PCS", 3.25, 11700.00, 100, 9.5, 11.2, 0.045],
    ]
    for row in rows:
        ws.append(row)
    ws.append([])
    ws.append(["Freight", 2150.0, "Insurance", 340.0])

    ws2 = wb.create_sheet("Charges")
    ws2.append(["Freight", 2150.0])
    ws2.append(["Insurance", 340.0])
    ws2.append(["Other Charges", 0.0])
    ws2.append(["Discount", 0.0])
    wb.save(path)
    print("wrote", os.path.relpath(path, ROOT))


def build_text_fixtures():
    txt = """COMMERCIAL INVOICE
Invoice No.: CI-2026-0188      Date: 2026-11-17
Order No.: SO-2026-0118        Contract No.: SC-2026-0042
Buyer: PACIFIC TRADING CO., LTD.
88 Ocean Avenue, Suite 500
San Francisco, CA 94110
United States
Contact: Jane Smith    Tel: +1 415 555 0123    Email: jane@pacifictrading.example
Payment: T/T 30% DEPOSIT, BALANCE AGAINST COPY OF B/L
Incoterm: FOB    Currency: USD
Port of Loading: SHANGHAI, CHINA    Port of Discharge: OAKLAND, USA
Country of Destination: UNITED STATES
Vessel: PACIFIC STAR    Voyage: 118W
ETD: 2026-12-05        ETA: 2026-12-19
L/C No.: LC26USA1234
Shipping Marks: PACIFIC TRADING
Items:
Ceramic Mug 12 oz      6912.00.00    2,400   PCS   1.85   4,440.00
Bamboo Cutting Board   4419.19.00    1,200   SET   6.40   7,680.00
Freight: USD 2,150.00
Insurance: USD 340.00
Remarks: Handle with care.
"""
    with open(os.path.join(TEXT_DIR, "order-sample.txt"), "w", encoding="utf-8") as fh:
        fh.write(txt)

    csv_text = """Description,HS Code,Qty,Unit,Unit Price,Amount,Cartons,N.W.(kg),G.W.(kg),CBM
Ceramic Mug 12 oz,6912.00.00,2400,PCS,1.85,4440.00,100,8.0,9.2,0.035
Bamboo Cutting Board Set,4419.19.00,1200,SET,6.40,7680.00,100,11.5,13.0,0.060
Double-wall Steel Bottle 500 ml,7323.93.00,3600,PCS,3.25,11700.00,100,9.5,11.2,0.045
"""
    with open(os.path.join(TEXT_DIR, "items-sample.csv"), "w", encoding="utf-8", newline="") as fh:
        fh.write(csv_text)

    tsv_text = csv_text.replace(",", "\t")
    with open(os.path.join(TEXT_DIR, "items-sample.tsv"), "w", encoding="utf-8", newline="") as fh:
        fh.write(tsv_text)

    json_obj = {
        "invoiceNo": "CI-2026-0188",
        "date": "2026-11-17",
        "buyer": {
            "nameEn": "PACIFIC TRADING CO., LTD.",
            "addressEn": "88 Ocean Avenue, Suite 500\nSan Francisco, CA 94110\nUnited States",
            "country": "UNITED STATES",
            "contact": "Jane Smith",
            "tel": "+1 415 555 0123",
            "email": "jane@pacifictrading.example",
        },
        "incoterm": "FOB",
        "currency": "USD",
        "portOfLoading": "SHANGHAI, CHINA",
        "portOfDischarge": "OAKLAND, USA",
        "vessel": "PACIFIC STAR",
        "voyage": "118W",
        "etd": "2026-12-05",
        "eta": "2026-12-19",
        "items": [
            {"nameEn": "Ceramic Mug 12 oz", "hsCode": "6912.00.00", "qty": 2400, "unit": "PCS", "unitPrice": 1.85, "amount": 4440.00},
            {"nameEn": "Bamboo Cutting Board Set", "hsCode": "4419.19.00", "qty": 1200, "unit": "SET", "unitPrice": 6.40, "amount": 7680.00},
        ],
    }
    with open(os.path.join(TEXT_DIR, "order-sample.json"), "w", encoding="utf-8") as fh:
        json.dump(json_obj, fh, ensure_ascii=False, indent=2)


def build_binary_stubs():
    write_bytes("damaged.docx", b"this is definitely not a zip archive \x00\x01\x02")
    write_bytes("damaged.xlsx", b"PK\x03\x04broken zip header without central directory")
    # 1x1 PNG
    png = (
        b"\x89PNG\r\n\x1a\n"
        + struct.pack(">I", 13) + b"IHDR" + struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
        + struct.pack(">I", zlib.crc32(b"IHDR" + struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) & 0xFFFFFFFF)
        + struct.pack(">I", 10) + b"IDAT" + zlib.compress(b"\x00\xff\x00\x00")
        + struct.pack(">I", zlib.crc32(b"IDAT" + zlib.compress(b"\x00\xff\x00\x00")) & 0xFFFFFFFF)
        + struct.pack(">I", 0) + b"IEND" + struct.pack(">I", zlib.crc32(b"IEND") & 0xFFFFFFFF)
    )
    write_bytes("fake-image.png", png)
    write_bytes("fake-scan.pdf", b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
    write_bytes("legacy.doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64)
    write_bytes("legacy.xls", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64)


def build_two_table_docx(path, separator):
    """Table A + separator paragraph + Table B (regression: DOCX block parsing)."""
    doc = Document()
    doc.add_paragraph("TWO TABLE DOCX FIXTURE")
    headers = ["Description", "HS Code", "Qty", "Unit", "Unit Price", "Amount"]
    first = [
        ["Ceramic Mug 12 oz", "6912.00.00", "2,400", "PCS", "1.85", "4,440.00"],
    ]
    second = [
        ["Bamboo Cutting Board Set", "4419.19.00", "1,200", "SET", "6.40", "7,680.00"],
        ["Double-wall Steel Bottle 500 ml", "7323.93.00", "3,600", "PCS", "3.25", "11,700.00"],
    ]
    for rows in (first, second):
        table = doc.add_table(rows=1 + len(rows), cols=len(headers))
        for i, header in enumerate(headers):
            table.cell(0, i).text = header
        for r, row in enumerate(rows, start=1):
            for c, value in enumerate(row):
                table.cell(r, c).text = value
        if rows is first:
            # Regression case: self-closing empty paragraph between the tables.
            if separator == "empty":
                doc.add_paragraph("")
            elif separator == "text":
                doc.add_paragraph("Middle paragraph between tables")
    doc.save(path)
    print("wrote", os.path.relpath(path, ROOT))


def build_metadata_items_docx(path):
    """Metadata block (paragraphs) followed by an item table — realistic supplier PI."""
    doc = Document()
    for line in [
        "SUPPLIER PROFORMA INVOICE",
        "PI No.: PI-2026-0088        Date: 2026-11-17",
        "Order No.: SO-2026-0118     Contract No.: SC-2026-0042",
        "Buyer: ATLANTIC HOME GOODS LLC",
        "350 Fifth Avenue, Suite 2100",
        "New York, NY 10118",
        "United States",
        "Payment: BY IRREVOCABLE L/C AT SIGHT",
        "L/C No.: LC26USA0091        L/C Date: 2026-11-07",
        "Incoterm: CIF    Currency: USD",
        "Port of Loading: NINGBO, CHINA    Port of Discharge: LOS ANGELES, USA",
        "Vessel: OOCL SUNRISE    Voyage: 026E",
        "ETD: 2026-12-10        ETA: 2026-12-24",
    ]:
        doc.add_paragraph(line)
    headers = ["Description", "HS Code", "Qty", "Unit", "Unit Price", "Amount"]
    rows = [
        ["Ceramic Mug 12 oz", "6912.00.00", "2,400", "PCS", "1.85", "4,440.00"],
        ["Bamboo Cutting Board Set", "4419.19.00", "1,200", "SET", "6.40", "7,680.00"],
    ]
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    for i, header in enumerate(headers):
        table.cell(0, i).text = header
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            table.cell(r, c).text = value
    doc.save(path)
    print("wrote", os.path.relpath(path, ROOT))


def build_metatable_itemtable_docx(path):
    """Metadata key/value table + empty paragraph + item table (mirrors Lead's
    samples/智能识别示例/示例-供应商形式发票.docx structure)."""
    doc = Document()
    doc.add_paragraph("SUPPLIER PROFORMA INVOICE / 供应商形式发票")
    doc.add_paragraph("Seller: HANGZHOU EVERGREEN HOUSEHOLD CO., LTD.")
    doc.add_paragraph("Buyer: PACIFIC RIM IMPORTS LLC")
    doc.add_paragraph("Contact: Olivia Brown    Tel: +61 2 5550 1188    Email: sourcing@pacificrim-imports.example")
    meta = [
        ["Order No.", "PR-2026-0418"],
        ["Invoice No.", "PI-2026-0512"],
        ["Date", "02 Dec 2026"],
        ["Incoterm", "CIF SYDNEY"],
        ["Currency", "USD"],
        ["Port of Loading", "SHANGHAI, CHINA"],
        ["Port of Discharge", "SYDNEY, AUSTRALIA"],
        ["Vessel", "OOCL BRISBANE"],
        ["Voyage", "V.118E"],
        ["ETD", "2026-12-18"],
        ["ETA", "2027-01-05"],
    ]
    meta_table = doc.add_table(rows=len(meta), cols=2)
    for r, row in enumerate(meta):
        meta_table.cell(r, 0).text = row[0]
        meta_table.cell(r, 1).text = row[1]
    # Regression case: self-closing empty paragraph between the two tables.
    doc.add_paragraph("")
    headers = ["Item No.", "Description of Goods", "HS Code", "Qty", "Unit", "Unit Price", "Amount", "Cartons", "N.W.", "G.W.", "CBM"]
    rows = [
        ["E-1001", "Ceramic Mug 12 oz", "6912.00.00", "2,400", "PCS", "1.85", "4,440.00", "100", "8.0", "9.2", "0.035"],
        ["E-1002", "Bamboo Cutting Board Set", "4419.19.00", "1,200", "SET", "6.40", "7,680.00", "100", "11.5", "13.0", "0.060"],
        ["E-1003", "Double-wall Steel Bottle 500 ml", "7323.93.00", "3,600", "PCS", "3.25", "11,700.00", "100", "9.5", "11.2", "0.045"],
    ]
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    for i, header in enumerate(headers):
        table.cell(0, i).text = header
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            table.cell(r, c).text = value
    doc.save(path)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    ensure_dirs()
    build_order_docx(os.path.join(ROOT, "order-sample.docx"))
    build_order_docx(os.path.join(ROOT, "order-cn.docx"), chinese=True)
    build_items_xlsx(os.path.join(ROOT, "items-sample.xlsx"))
    build_two_table_docx(os.path.join(ROOT, "twotables-empty.docx"), "empty")
    build_two_table_docx(os.path.join(ROOT, "twotables-text.docx"), "text")
    build_metadata_items_docx(os.path.join(ROOT, "metadata-items.docx"))
    build_metatable_itemtable_docx(os.path.join(ROOT, "metatable-itemtable-empty.docx"))
    build_text_fixtures()
    build_binary_stubs()
    print("fixtures ready in", ROOT)


if __name__ == "__main__":
    main()
