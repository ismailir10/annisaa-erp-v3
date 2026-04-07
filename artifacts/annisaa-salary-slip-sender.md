var TEMPLATE_ID = '1bGCRq9D0dwtEeAbmjWGQWrH-dJgvHqY29ByN6_yhEho'; // Replace with your template ID

function generateAndSendSalarySlips() {
  // Add a confirmation box
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('Confirmation', 'Do you want to generate and send salary slips?', ui.ButtonSet.YES_NO);
  
  // If the user clicks 'No', exit the function
  if (response == ui.Button.NO) {
    return;
  }
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var range = sheet.getDataRange();
  var values = range.getValues();

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var email = row[3]; // Assuming email is in column D
    var pdf = createPdfFromTemplate(row);
    sendEmail(email, pdf);
  }
}

function createPdfFromTemplate(row) {
  // Make a copy of the template document
  var templateFile = DriveApp.getFileById(TEMPLATE_ID);
  var copy = templateFile.makeCopy('Salary Slip - ' + row[2]);
  var doc = DocumentApp.openById(copy.getId());
  var body = doc.getBody();

  // Format the period start and end dates to 'DD MMM YYYY'
  var startDate = new Date(row[5]);
  var endDate = new Date(row[6]);
  var formattedStartDate = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  var formattedEndDate = endDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  // Replace placeholders in the template with employee data, formatted appropriately
  body.replaceText('{{no}}', row[0]);
  body.replaceText('{{kode_pegawai}}', row[1]);
  body.replaceText('{{nama}}', row[2]);
  body.replaceText('{{email}}', row[3]);
  body.replaceText('{{jabatan}}', row[4]);
  body.replaceText('{{periode_gaji_mulai}}', formattedStartDate);
  body.replaceText('{{periode_gaji_selesai}}', formattedEndDate);
  body.replaceText('{{jumlah_hari_kerja}}', row[7]);
  body.replaceText('{{gaji_pokok}}', formatRupiah(row[8]));
  body.replaceText('{{tunjangan_jabatan}}', formatRupiah(row[9]));
  body.replaceText('{{tunjangan_gt}}', formatRupiah(row[10]));
  body.replaceText('{{bpjs}}', formatRupiah(row[11]));
  body.replaceText('{{tunjangan_transport}}', formatRupiah(row[12]));
  body.replaceText('{{tunjangan_msk}}', formatRupiah(row[13]));
  body.replaceText('{{insentif_outdoor}}', formatRupiah(row[14]));
  body.replaceText('{{insentif_libur}}', formatRupiah(row[15]));
  body.replaceText('{{insentif_3m}}', formatRupiah(row[16]));
  body.replaceText('{{insentif_dc}}', formatRupiah(row[17]));
  body.replaceText('{{insentif_dll}}', formatRupiah(row[18]));
  body.replaceText('{{jumlah}}', formatRupiah(row[19]));
  body.replaceText('{{deduksi_bpjs}}', formatRupiah(row[20]));
  body.replaceText('{{deduksi_dplk_dll}}', formatRupiah(row[21]));
  body.replaceText('{{deduksi_jumlah}}', formatRupiah(row[22]));
  body.replaceText('{{diterima}}', formatRupiah(row[23]));

  doc.saveAndClose();

  // Convert the document to PDF
  var pdf = DriveApp.getFileById(copy.getId()).getAs('application/pdf');
  pdf.setName('Salary Slip - ' + row[2]);

  // Delete the temporary Google Doc copy
  DriveApp.getFileById(copy.getId()).setTrashed(true);

  return pdf;
}

function sendEmail(email, pdf) {
  var subject = 'Slip Gaji Anda - Annisaa Sekolahku';
  var body = 'Berikut adalah slip gaji Anda terlampir. Terima kasih.';
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body,
    attachments: [pdf]
  });
}

// Helper function to format numbers as Rupiah
function formatRupiah(amount) {
  var formatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);
  return formatted;
}
