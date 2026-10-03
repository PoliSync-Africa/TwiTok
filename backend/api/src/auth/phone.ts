export const COUNTRY_DIAL_CODES: Record<string, string> = {
  GH:"+233",NG:"+234",US:"+1",CA:"+1",GB:"+44",IN:"+91",ZA:"+27",KE:"+254",UG:"+256",TZ:"+255",RW:"+250",ET:"+251",EG:"+20",MA:"+212",DZ:"+213",TN:"+216",SN:"+221",CI:"+225",CM:"+237",BJ:"+229",BF:"+226",ML:"+223",NE:"+227",TG:"+228",SL:"+232",LR:"+231",GM:"+220",GN:"+224",GW:"+245",CV:"+238",MR:"+222",GM:"+220",BR:"+55",MX:"+52",AR:"+54",CL:"+56",CO:"+57",PE:"+51",VE:"+58",UY:"+598",PY:"+595",BO:"+591",EC:"+593",CR:"+506",PA:"+507",GT:"+502",HN:"+504",SV:"+503",NI:"+505",DO:"+1",JM:"+1",TT:"+1",BB:"+1",BS:"+1",HT:"+509",CU:"+53",AU:"+61",NZ:"+64",JP:"+81",CN:"+86",KR:"+82",SG:"+65",MY:"+60",ID:"+62",PH:"+63",TH:"+66",VN:"+84",PK:"+92",BD:"+880",LK:"+94",NP:"+977",AE:"+971",SA:"+966",QA:"+974",KW:"+965",BH:"+973",OM:"+968",JO:"+962",IL:"+972",TR:"+90",IR:"+98",IQ:"+964",SY:"+963",LB:"+961",YE:"+967",DE:"+49",FR:"+33",IT:"+39",ES:"+34",PT:"+351",NL:"+31",BE:"+32",CH:"+41",AT:"+43",SE:"+46",NO:"+47",DK:"+45",FI:"+358",IE:"+353",PL:"+48",CZ:"+420",SK:"+421",HU:"+36",RO:"+40",BG:"+359",GR:"+30",UA:"+380",RU:"+7",RS:"+381",HR:"+385",SI:"+386",BA:"+387",AL:"+355",MK:"+389",EE:"+372",LV:"+371",LT:"+370",IS:"+354",MT:"+356",CY:"+357",LU:"+352",LI:"+423",MC:"+377",SM:"+378",VA:"+39",AD:"+376",ME:"+382",MD:"+373",GE:"+995",AM:"+374",AZ:"+994",KZ:"+7",UZ:"+998",KG:"+996",TJ:"+992",TM:"+993",MN:"+976",AF:"+93",KH:"+855",LA:"+856",MM:"+95",BN:"+673",FJ:"+679",PG:"+675",WS:"+685",TO:"+676",VU:"+678",SB:"+677",FM:"+691",MH:"+692",PW:"+680",NR:"+674",KI:"+686",TV:"+688",ZA:"+27"
};

export function normalizeInternationalPhone(value: unknown, country?: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const cleaned = raw.replace(/[\\s().-]/g, "");
  const iso = String(country ?? "").trim().toUpperCase();
  const dial = COUNTRY_DIAL_CODES[iso];
  const withCode = cleaned.startsWith("+") ? cleaned : dial ? dial + cleaned.replace(/^0+/, "") : cleaned;
  if (!/^\\+[0-9]{7,15}$/.test(withCode)) throw new Error("Enter a valid international phone number");
  return withCode;
}

export function countryDialCode(country?: string) {
  return COUNTRY_DIAL_CODES[String(country ?? "").trim().toUpperCase()] ?? "";
}
