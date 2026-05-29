/**
 * بنك الامتحانات والأسئلة الافتراضي لمنصة arabya.ai
 * يحتوي على اختبارات مسبقة في فروع النحو والبلاغة والأدب مع بيانات أكاديمية كاملة،
 * مضافاً إليها المجموع النهائي للاختبار ونظام درجات مخصصة لكل سؤال (أوزان الأسئلة).
 */
const defaultExams = [
  {
    id: "arabic_grammar",
    title: "اختبار النحو والصرف الشامل",
    subject: "النحو والصرف",
    university: "جامعة القاهرة",
    faculty: "كلية دار العلوم",
    level: "الفرقة الأولى",
    examType: "أعمال فصلية",
    totalScore: 100, // المجموع النهائي للاختبار
    questions: [
      // 9 اختيار من متعدد وصواب/خطأ، مع تعيين 10 نقاط لكل سؤال
      {
        id: 1,
        type: "multiple",
        question: "ما هو الفعل المرفوع دائماً إذا لم يسبقه ناصب ولا جازم؟",
        options: ["الفعل الماضي", "فعل الأمر", "الفعل المضارع"],
        correctAnswer: 2,
        points: 10 // درجة هذا السؤال الفردي
      },
      {
        id: 2,
        type: "multiple",
        question: "ما حكم الفاعل الإعرابي في اللغة العربية؟",
        options: ["الرفع دائماً", "النصب دائماً", "الجر دائماً"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 3,
        type: "multiple",
        question: "أي من الحروف التالية يعتبر من حروف الجر؟",
        options: ["أنْ", "في", "لولا"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 4,
        type: "multiple",
        question: "ما هو تعريف المبتدأ في الجملة الاسمية؟",
        options: ["اسم مرفوع تبدأ به الجملة غالباً", "فعل ماضٍ يدل على الحدث", "اسم منصوب يبين الهيئة"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 5,
        type: "multiple",
        question: "تدخل 'كان وأخواتها' على الجملة الاسمية فماذا تفعل؟",
        options: ["ترفع المبتدأ وتنصب الخبر", "تنصب المبتدأ وترفع الخبر", "تنصب المبتدأ والخبر معاً"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 6,
        type: "boolean",
        question: "الحروف كلها مبنية في اللغة العربية ولا محل لها من الإعراب.",
        options: ["صواب", "خطأ"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 7,
        type: "boolean",
        question: "تعمل 'إن وأخواتها' على ترفع المبتدأ وتنصب الخبر.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 8,
        type: "boolean",
        question: "يكون المفعول به دائماً مجروراً بالكسرة.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 9,
        type: "boolean",
        question: "الفعل الماضي يكون مبنياً دائماً في جميع حالاته.",
        options: ["صواب", "خطأ"],
        correctAnswer: 0,
        points: 10
      },
      // سؤال مقالي
      {
        id: 10,
        type: "essay",
        question: "اشرح بالتفصيل أحكام مطابقة الفعل للفاعل تأنيثاً وتذكيراً مع التمثيل بمثال مناسب لكل حالة.",
        options: [],
        correctAnswer: "",
        points: 10
      }
    ]
  },
  {
    id: "arabic_rhetoric",
    title: "اختبار البلاغة والأدب العربي",
    subject: "البلاغة والأدب",
    university: "جامعة الأزهر",
    faculty: "كلية اللغة العربية",
    level: "الفرقة الثانية",
    examType: "نهائي",
    totalScore: 100, // المجموع النهائي للاختبار
    questions: [
      // 9 أسئلة موضوعية، مع تعيين 10 نقاط لكل سؤال
      {
        id: 1,
        type: "multiple",
        question: "ما العلم البلاغي الذي يهتم بجمال صياغة المعاني ووضوحها وتنوع التعبير عنها؟",
        options: ["علم البديع", "علم البيان", "علم المعاني"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 2,
        type: "multiple",
        question: "ما نوع التشبيه الذي حُذِف منه وجه الشبه وأداة التشبيه معاً؟",
        options: ["التشبيه البليغ", "التشبيه المجمل", "التشبيه المرسل"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 3,
        type: "multiple",
        question: "أي من الخيارات التالية يمثل محسنًا بديعيًا من نوع (طباق)؟",
        options: ["العلم والجهل", "العلم والعمل", "الليل والظلام"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 4,
        type: "multiple",
        question: "من هو الشاعر العربي الحديث الملقب بـ 'أمير الشعراء'؟",
        options: ["حافظ إبراهيم", "أحمد شوقي", "أبو الطيب المتنبي"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 5,
        type: "multiple",
        question: "ما الغرض البلاغي لأسلوب الاستفهام في الآية الكريمة: 'أليس الله بكافٍ عبده؟'",
        options: ["الإنكار", "التقرير والتوكيد", "التعجب والدهشة"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 6,
        type: "boolean",
        question: "الطباق هو الجمع بين كلمة وضدها في المعنى لتوضيحه.",
        options: ["صواب", "خطأ"],
        correctAnswer: 0,
        points: 10
      },
      {
        id: 7,
        type: "boolean",
        question: "الكناية هي لفظ أطلق وأريد به لازم معناه مع امتناع إرادة المعنى الأصلي.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 8,
        type: "boolean",
        question: "يعتبر العصر الأموي هو العصر الذهبي للأدب العربي وحركة التدوين الواسعة.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      {
        id: 9,
        type: "boolean",
        question: "الاستعارة التصريحية هي ما حُذِف فيها المشبه به وصُرّح بالمشبه.",
        options: ["صواب", "خطأ"],
        correctAnswer: 1,
        points: 10
      },
      // سؤال مقالي
      {
        id: 10,
        type: "essay",
        question: "قارن بالتفصيل بين الاستعارة المكنية والاستعارة التصريحية موضحاً الفروق الجوهرية مع التمثيل ببيت شعر لكل منهما.",
        options: [],
        correctAnswer: "",
        points: 10
      }
    ]
  }
];

// تصدير أو إتاحته للمتصفح
if (typeof window !== 'undefined') {
  window.defaultExams = defaultExams;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = defaultExams;
}
