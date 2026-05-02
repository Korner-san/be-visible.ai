require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const INPUT_FILE = path.join(process.cwd(), 'tmp', 'real-estate-content-type-research.json');
const CLASSIFIER_VERSION = 'real_estate_israel_content_type_v2';

const FINAL_CATEGORIES = {
  MARKET_ANALYSIS_ARTICLE: {
    hebrew: 'מאמר ניתוח שוק',
    description: 'מאמרים אנליטיים, סקירות שוק, תחזיות, ניתוח עסקאות, ניתוח שכונות או פרשנות כלכלית.'
  },
  NEWS_ARTICLE: {
    hebrew: 'כתבה חדשותית',
    description: 'כתבות מערכתיות המדווחות על אירועים, נתונים, רגולציה, עסקאות או עדכוני שוק.'
  },
  LONG_FORM_GUIDE: {
    hebrew: 'מדריך עומק / מאמר הסבר',
    description: 'מדריכים, מאמרי הסבר, how-to, מדריכים משפטיים, מדריכי מס, רכישה או מחירים.'
  },
  HOMEPAGE_COMMERCIAL_GATEWAY: {
    hebrew: 'דף בית / שער מסחרי',
    description: 'דפי בית או שערים מסחריים של חברות, סוכנויות, יזמים, מרקטפלייסים או נותני שירות.'
  },
  SEARCH_LISTINGS_PLATFORM: {
    hebrew: 'פלטפורמת חיפוש נכסים',
    description: 'עמודי כניסה לפלטפורמות שבהן משתמשים מחפשים או מגלים נכסים, פרויקטים, חברות או שירותים.'
  },
  FILTERED_RESULTS_OR_LISTING_INDEX: {
    hebrew: 'עמוד תוצאות / אינדקס נכסים',
    description: 'תוצאות חיפוש, אינדקסים, רשימות פרויקטים, מלאי נכסים, דירות שנמכרו או עמודי קטגוריה.'
  },
  PROFESSIONAL_DIRECTORY: {
    hebrew: 'אינדקס בעלי מקצוע / חברות',
    description: 'קטלוגים, דירוגים ואינדקסים של אנשי מקצוע, חברות, יזמים, קבלנים, סוכנויות או משקיעים.'
  },
  OFFICIAL_REPORT_OR_DOCUMENT: {
    hebrew: 'דוח / מסמך רשמי',
    description: 'דוחות רשמיים, PDF, מסמכים ממשלתיים, רגולטוריים, משפטיים, מוסדיים או דיווחים פורמליים.'
  },
  OFFICIAL_PUBLICATION_OR_DATA_INDEX: {
    hebrew: 'אינדקס רשמי / מאגר נתונים',
    description: 'אינדקס פרסומים רשמיים, פורטל ממשלתי/סטטיסטי, מאגר נתונים או רשימת דוחות ודאטה.'
  },
  DATA_TABLE_OR_BENCHMARK: {
    hebrew: 'טבלת נתונים / מדד השוואתי',
    description: 'טבלאות נתונים, מדדים, דירוגים, מחשבונים, טבלאות תשואה/מחירים או דאטה מובנה להשוואה.'
  },
  OPINION_COLUMN: {
    hebrew: 'טור דעה',
    description: 'טורי דעה, פרשנות אישית, נקודת מבט מומחה או מאמרים סובייקטיביים.'
  },
  BRANDED_BLOG_OR_COMMERCIAL_ARTICLE: {
    hebrew: 'מאמר בלוג / תוכן ממותג',
    description: 'פוסטים בבלוג, תוכן ממומן, מאמרים מקצועיים או תוכן חינוכי שמפורסם מטעם חברה/מותג.'
  },
  SOCIAL_OR_COMMUNITY_PAGE: {
    hebrew: 'רשת חברתית / קהילה',
    description: 'פוסטים ברשתות חברתיות, קבוצות, פורומים, דיונים קהילתיים או עמודים חברתיים סגורים.'
  },
  REFERENCE_ENTRY: {
    hebrew: 'ערך מידע / מילון',
    description: 'ערכי מילון, אנציקלופדיה, גלוסרי, ויקי או עמודי רפרנס עובדתיים.'
  },
  PROJECT_OR_SERVICE_PAGE: {
    hebrew: 'עמוד פרויקט / שירות',
    description: 'עמודי פרויקט, שירות, מוצר, אודות, מידע אזורי או הצעה מסחרית שאינם דף בית.'
  }
};

const KEY_TO_FINAL = {
  MARKET_ANALYSIS_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  MARKET_FORECAST_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  MARKET_ANALYSIS_REPORT: 'MARKET_ANALYSIS_ARTICLE',
  TRANSACTION_ANALYSIS_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  NEIGHBORHOOD_ANALYSIS_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  CONSTRUCTION_TREND_ANALYSIS_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  PROFESSIONAL_ANALYSIS_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  RESEARCH_ARTICLE: 'MARKET_ANALYSIS_ARTICLE',
  UNCLEAR_PAGE: 'BRANDED_BLOG_OR_COMMERCIAL_ARTICLE',

  NEWS_ARTICLE: 'NEWS_ARTICLE',
  NEWS_SOCIAL_MEDIA_POST: 'NEWS_ARTICLE',

  LONG_FORM_GUIDE_EXPLAINER: 'LONG_FORM_GUIDE',
  LONG_FORM_GUIDE: 'LONG_FORM_GUIDE',
  HOW_TO_GUIDE: 'LONG_FORM_GUIDE',
  EXPLAINER_GUIDE: 'LONG_FORM_GUIDE',
  GUIDE_ARTICLE: 'LONG_FORM_GUIDE',
  GUIDE_EXPLAINER: 'LONG_FORM_GUIDE',
  PURCHASE_GUIDE: 'LONG_FORM_GUIDE',
  PRICE_GUIDE: 'LONG_FORM_GUIDE',
  INVESTMENT_GUIDE: 'LONG_FORM_GUIDE',
  LEGAL_ARTICLE: 'LONG_FORM_GUIDE',
  INFORMATION_ARTICLE: 'LONG_FORM_GUIDE',
  INVESTMENT_ARTICLE: 'LONG_FORM_GUIDE',

  HOMEPAGE_COMMERCIAL_GATEWAY: 'HOMEPAGE_COMMERCIAL_GATEWAY',
  HOMEPAGE: 'HOMEPAGE_COMMERCIAL_GATEWAY',
  BUSINESS_PAGE: 'HOMEPAGE_COMMERCIAL_GATEWAY',

  SEARCH_LISTINGS_PLATFORM: 'SEARCH_LISTINGS_PLATFORM',

  FILTERED_SEARCH_RESULTS_PAGE: 'FILTERED_RESULTS_OR_LISTING_INDEX',
  PROJECTS_PAGE: 'FILTERED_RESULTS_OR_LISTING_INDEX',
  PROJECT_LIST: 'FILTERED_RESULTS_OR_LISTING_INDEX',
  INVESTOR_LIST: 'FILTERED_RESULTS_OR_LISTING_INDEX',

  PROFESSIONAL_DIRECTORY: 'PROFESSIONAL_DIRECTORY',
  DEVELOPER_DIRECTORY: 'PROFESSIONAL_DIRECTORY',
  PROFESSIONAL_RANKING: 'PROFESSIONAL_DIRECTORY',

  OFFICIAL_PDF_REPORT: 'OFFICIAL_REPORT_OR_DOCUMENT',
  OFFICIAL_REPORT: 'OFFICIAL_REPORT_OR_DOCUMENT',
  OFFICIAL_DOCUMENT: 'OFFICIAL_REPORT_OR_DOCUMENT',
  OFFICIAL_DOCS: 'OFFICIAL_REPORT_OR_DOCUMENT',
  EXECUTIVE_INSTRUCTION: 'OFFICIAL_REPORT_OR_DOCUMENT',

  OFFICIAL_PUBLICATION_INDEX: 'OFFICIAL_PUBLICATION_OR_DATA_INDEX',
  OFFICIAL_INFORMATION_PAGE: 'OFFICIAL_PUBLICATION_OR_DATA_INDEX',
  OFFICIAL_PAGE: 'OFFICIAL_PUBLICATION_OR_DATA_INDEX',

  DATA_TABLE: 'DATA_TABLE_OR_BENCHMARK',
  DATA_TABLE_BENCHMARK_INDEX: 'DATA_TABLE_OR_BENCHMARK',
  CALCULATOR_TOOL: 'DATA_TABLE_OR_BENCHMARK',

  OPINION_COLUMN: 'OPINION_COLUMN',
  OPINION_ANALYSIS_ARTICLE: 'OPINION_COLUMN',

  BRANDED_BLOG_ARTICLE: 'BRANDED_BLOG_OR_COMMERCIAL_ARTICLE',
  BRANDED_CONTENT: 'BRANDED_BLOG_OR_COMMERCIAL_ARTICLE',
  PROFESSIONAL_ARTICLE: 'BRANDED_BLOG_OR_COMMERCIAL_ARTICLE',
  EDUCATIONAL_PLATFORM: 'BRANDED_BLOG_OR_COMMERCIAL_ARTICLE',

  SOCIAL_MEDIA_POST: 'SOCIAL_OR_COMMUNITY_PAGE',
  COMMUNITY_GROUP: 'SOCIAL_OR_COMMUNITY_PAGE',
  FORUM_DISCUSSION: 'SOCIAL_OR_COMMUNITY_PAGE',
  OFFICIAL_SOCIAL_MEDIA_POST: 'SOCIAL_OR_COMMUNITY_PAGE',

  ENCYCLOPEDIA_REFERENCE_ENTRY: 'REFERENCE_ENTRY',
  ENCYCLOPEDIA_ENTRY: 'REFERENCE_ENTRY',
  TRANSLATION_TOOL_PAGE: 'REFERENCE_ENTRY',

  PRODUCT_PAGE: 'PROJECT_OR_SERVICE_PAGE',
  PROJECT_PAGE: 'PROJECT_OR_SERVICE_PAGE',
  SERVICES_PAGE: 'PROJECT_OR_SERVICE_PAGE',
  ABOUT_PAGE: 'PROJECT_OR_SERVICE_PAGE',
  AREA_INFO_PAGE: 'PROJECT_OR_SERVICE_PAGE',
  INFORMATION_PAGE: 'PROJECT_OR_SERVICE_PAGE',
  OFFICIAL_INFORMATION_PAGE: 'OFFICIAL_PUBLICATION_OR_DATA_INDEX'
};

function confidenceFor(finalKey, sourceConfidence) {
  if (!sourceConfidence) return 0.8;
  return Math.max(0.5, Math.min(0.98, Number(sourceConfidence)));
}

async function main() {
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const brandId = data.brand.id;
  const rows = [];
  const unmapped = [];

  for (const item of data.classifications || []) {
    const sourceKey = item.classification?.englishKey;
    const finalKey = KEY_TO_FINAL[sourceKey];
    if (!finalKey) {
      unmapped.push({ url: item.url, sourceKey });
      continue;
    }

    rows.push({
      brand_id: brandId,
      url_id: item.urlId,
      content_structure_category: finalKey,
      classification_confidence: confidenceFor(finalKey, item.classification?.confidence),
      classifier_version: CLASSIFIER_VERSION,
      classified_at: new Date().toISOString()
    });
  }

  if (unmapped.length > 0) {
    console.error('Unmapped source keys:', unmapped);
    process.exit(1);
  }

  let stored = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('brand_url_content_facts')
      .upsert(batch, { onConflict: 'brand_id,url_id' });

    if (error) throw new Error(error.message);
    stored += batch.length;
  }

  const counts = rows.reduce((acc, row) => {
    acc[row.content_structure_category] = (acc[row.content_structure_category] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    brand: data.brand,
    stored,
    classifierVersion: CLASSIFIER_VERSION,
    counts: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, hebrew: FINAL_CATEGORIES[key].hebrew, count }))
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
