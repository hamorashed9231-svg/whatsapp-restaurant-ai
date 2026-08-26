import multer from 'multer';

// إعداد التخزين في الذاكرة لتجنب حفظ الملفات على القرص الصلب وتسهيل المعالجة
const storage = multer.memoryStorage();

// التحقق من نوع الملف المرفوع لضمان أنه Excel أو CSV فقط
const fileFilter = (req: any, file: Express.Multer.File, callback: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream' // بعض الأنظمة ترفع الـ CSV بنوع عام
  ];

  const allowedExtensions = ['.csv', '.xls', '.xlsx'];
  const originalName = file.originalname || '';
  const fileExtension = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    callback(null, true);
  } else {
    callback(new Error('نوع الملف غير مدعوم! يرجى رفع ملف Excel (.xlsx أو .xls) أو ملف CSV فقط.'));
  }
};

// وسيط الرفع بحد أقصى 5 ميجابايت للملف
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
