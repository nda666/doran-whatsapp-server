import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { campaignScope as ownerScope, phoneScope } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { summarize } from "@/server/messaging/analytics";
import { statusLabel } from "@/lib/messagingLabels";
import { z } from "zod";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  const id = z.string().uuid().safeParse(req.query.campaignId);
  if (!id.success) return res.status(400).json({ message: "ID campaign tidak valid." });
  const campaign = await prisma.campaign.findFirst({ where: { id: id.data, ...ownerScope(req.user!) } });
  if (!campaign) return res.status(404).json({ message: "Campaign tidak ditemukan." });
  const where = { campaignId: campaign.id, userId: campaign.userId };
  const summary = await summarize(where);
  const devices = await prisma.phone.findMany({ where: { ...phoneScope(req.user!), id: { in: Array.isArray(campaign.phoneIds) ? campaign.phoneIds.filter((id): id is string => typeof id === "string") : [] } }, select: { id: true, name: true, number: true } });
  const metricRows = [["Total penerima", summary.total], ["Pernah dicoba", summary.attempted], ["Terkirim", summary.sent], ["Diterima", summary.delivered], ["Dibaca", summary.read], ["Gagal terminal setelah percobaan", summary.failed], ["Diblokir", summary.suppressed], ["Menunggu / diproses", summary.pending], ["Perlu diperiksa", summary.uncertain], ["Tingkat diterima (%)", summary.deliveryRate], ["Tingkat dibaca (%)", summary.readRate], ["Tingkat gagal (%)", summary.failureRate]];
  const note = "Terkirim = diakui server WhatsApp; diterima/dibaca berdasarkan receipt yang teramati. Tidak ada receipt bukan berarti gagal. Diterima / pernah dicoba; dibaca / diterima; gagal terminal / pernah dicoba. Retry dihitung sebagai satu pesan logis.";
  if (req.query.export === "xlsx") {
    if (summary.total > 10000) return res.status(400).json({ message: "Ekspor Excel maksimal 10.000 penerima per campaign." });
    const rows = await prisma.waDispatch.findMany({ where, orderBy: { createdAt: "asc" }, take: 10000 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Ringkasan");
    sheet.addRows([["Campaign", campaign.name], ["Dibuat pada (UTC)", new Date().toISOString()], ...metricRows, ["Definisi", note]]);
    sheet.columns = [{ width: 40 }, { width: 75 }];
    const failures = workbook.addWorksheet("Alasan gagal"); failures.addRows([["Alasan", "Jumlah"], ...summary.failures.map(r => [r.reason, r.count])]); failures.columns = [{ width: 45 }, { width: 15 }];
    const detail = workbook.addWorksheet("Penerima");
    detail.addRows([["Nomor penerima", "Perangkat", "Status", "Alasan", "Percobaan", "Terkirim UTC", "Diterima UTC", "Dibaca UTC"], ...rows.map(r => [r.recipient, devices.find(d => d.id === r.phoneId)?.name || r.phoneId, statusLabel(r.status), r.lastError || "", r.attempts, r.sentAt?.toISOString() || "", r.deliveredAt?.toISOString() || "", r.readAt?.toISOString() || ""])]);
    detail.columns.forEach(c => { c.width = 28; }); detail.getColumn(1).numFmt = "@";
    const deviceSheet = workbook.addWorksheet("Perangkat");
    deviceSheet.addRows([["Perangkat", "Status", "Jumlah"], ...summary.devices.flatMap(d => Object.entries(d.counts).map(([status, count]) => [devices.find(p => p.id === d.phoneId)?.name || d.phoneId, statusLabel(status), count]))]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaign.id}.xlsx"`);
    return res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
  }
  if (req.query.export === "pdf") {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => { doc.on("data", c => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
    doc.fontSize(18).text("Laporan campaign Doran WA"); doc.moveDown();
    doc.fontSize(12).text(campaign.name).text(`Diperbarui: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`); doc.moveDown();
    metricRows.forEach(([label, value]) => doc.text(`${label}: ${value === null ? "Data belum tersedia" : typeof value === "number" ? Number(value.toFixed(2)).toLocaleString("id-ID") : value}`));
    doc.moveDown().fontSize(10).text(note); doc.moveDown().fontSize(14).text("Alasan kegagalan"); doc.fontSize(11);
    if (!summary.failures.length) doc.text("Tidak ada kegagalan tercatat.");
    summary.failures.forEach(r => doc.text(`${r.reason}: ${r.count}`));
    doc.moveDown().fontSize(14).text("Rincian per perangkat"); doc.fontSize(11);
    summary.devices.forEach(d => { doc.moveDown(.5).text(devices.find(p => p.id === d.phoneId)?.name || d.phoneId); doc.text(Object.entries(d.counts).map(([status, count]) => `${statusLabel(status)}: ${count}`).join(" | ")); });
    doc.end();
    const file = await complete;
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaign.id}.pdf"`);
    return res.send(file);
  }
  return res.json({ campaign, summary, devices, asOf: new Date(), note });
});
