import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export function downloadPdf(title: string, headers: string[], rows: Array<Array<string | number>>) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  autoTable(doc, {
    startY: 24,
    head: [headers],
    body: rows.map((row) => row.map((cell) => String(cell ?? ""))),
    styles: {
      fontSize: 9
    },
    headStyles: {
      fillColor: [67, 97, 238]
    }
  });
  doc.save(`${slugify(title)}.pdf`);
}

export function downloadExcel(sheetName: string, headers: string[], rows: Array<Array<string | number>>) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${slugify(sheetName)}.xlsx`);
}

export function downloadCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const csvRows = [headers, ...rows].map((row) =>
    row
      .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(fileName)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
