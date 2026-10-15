/* =====================================================================
 * app.js ── 報價計算與畫面更新（純 JavaScript，不需要任何框架或伺服器）
 * ---------------------------------------------------------------------
 * 所有費率與參數都在 rates.js；本檔只放「計算邏輯」與「畫面呈現」。
 * 計算規則逐行對照原報價工具，結果應與原工具完全相同。
 * ===================================================================== */
(function () {
  "use strict";

  var R = window.QUOTE_RATES;
  var RULES = R.RULES;

  var money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }); // 金額：整數
  var wan = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });   // 萬元：最多 1 位小數

  /* ---------------------------------------------------------------
   * 民國生日 → 保險年齡（所有險種、所有年齡判斷共用這一個函式）
   * ---------------------------------------------------------------
   * 輸入：6 碼（如 700101）或 7 碼（如 1000101）民國生日，非數字字元會被忽略。
   * 規則（富邦「保險年齡」：超過半年就加一歲）：
   *   1. 足歲 = 今天以前（含今天）已經過了幾個生日。
   *   2. 以「最近一次生日 + 6 個月」為半歲日；今天「晚於」半歲日才加 1 歲。
   *      剛好滿 6 個月的那一天不加歲，隔天才加。
   * 月底處理（比照民法第 121 條「無相當日者，以其月之末日」）：
   *   ‧ 半歲日落在不存在的日期時，改用該月最後一天。
   *     例：8/31 生 → 半歲日為 2/28（閏年 2/29）；3/31 生 → 9/30。
   *   ‧ 2/29 生日在非閏年以 2/28 當作生日；半歲日仍以原本的 29 日推算（8/29）。
   * 回傳：{ birth, exactAge（足歲）, age（保險年齡） }；
   *       日期不存在（如 700231）→ null；生日在未來 → age = -1（顯示生日錯誤）。
   * 半歲月數設定在 rates.js 的 RULES.insuranceAge.roundUpAfterMonths。
   * --------------------------------------------------------------- */
  function dateClamped(year, month0, day) {
    // 建立 year 年 month0 月（0 起算、可超過 11）的 day 日；該月沒有這一天就用月底
    var first = new Date(year, month0, 1);
    var lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
  }

  function parseRocBirth(value, today) {
    var digits = String(value).replace(/\D/g, "");
    if (digits.length !== 6 && digits.length !== 7) return null;
    var yearDigits = digits.length - 4;
    var rocYear = Number(digits.slice(0, yearDigits));
    var month = Number(digits.slice(yearDigits, yearDigits + 2));
    var day = Number(digits.slice(yearDigits + 2));
    var year = rocYear + 1911;
    var birth = new Date(year, month - 1, day);
    if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;

    var now = today || new Date();
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 只比日期，不比時間
    if (birth > today0) return { birth: birth, exactAge: -1, age: -1 };

    // 1. 足歲
    var exactAge = today0.getFullYear() - year;
    if (dateClamped(today0.getFullYear(), month - 1, day) > today0) exactAge -= 1;

    // 2. 最近一次生日 + N 個月（半歲日），今天晚於半歲日 → 加 1 歲
    var months = RULES.insuranceAge.roundUpAfterMonths;
    var halfDay = dateClamped(year + exactAge, month - 1 + months, day);
    var age = exactAge + (today0 > halfDay ? 1 : 0);

    return { birth: birth, exactAge: exactAge, age: age };
  }

  function findBone(id) {
    for (var i = 0; i < R.BONES.length; i++) if (R.BONES[i].id === id) return R.BONES[i];
    return R.BONES[8]; // 找不到時預設「橈骨或尺骨」（同原工具）
  }

  /* ---------------------------------------------------------------
   * 核心計算：輸入 state，回傳所有保費與給付數字（純函式，方便測試）
   * --------------------------------------------------------------- */
  function compute(s, today) {
    var parsed = parseRocBirth(s.rocBirth, today);
    var age = parsed ? parsed.age : -1;
    var pay = R.PAY_MODES[s.payMode];
    var factor = pay.factor;
    var oi = s.occupation - 1; // 職業類別 → 陣列索引

    // 搭配上限
    var maxAdh = s.hasExistingMain ? RULES.adh.max : Math.min(RULES.adh.max, s.olaAmount * RULES.adh.mainMultiple);
    var effectiveAdh = Math.max(0, Math.min(s.adhAmount, maxAdh));
    var tmrMax = Math.min(RULES.tmr.max, Math.floor(s.adgAmount * RULES.tmr.adgRatio));
    var effectiveTmr = Math.max(0, Math.min(s.tmrAmount, RULES.tmr.max, Math.floor(s.adgAmount * RULES.tmr.adgRatio)));

    var bone = s.boneId ? findBone(s.boneId) : null; // "" = 骨折部位「不選」
    var fracture = R.FRACTURE_TYPES[s.fractureType];
    var fractureFactor = fracture.factor;
    var hospitalDays = Math.min(RULES.maxHospitalDays, Math.max(0, Number(s.hospitalDaysInput) || 0));

    // ---- 保費 ----
    var premiums = null;
    if (age >= 0) {
      var olaRow = R.OLA6_RATES[s.olaTerm] ? R.OLA6_RATES[s.olaTerm][String(age)] : undefined;
      var olaRate = s.hasExistingMain ? 0 : (olaRow ? olaRow[s.gender] : undefined);
      var ola = s.hasExistingMain ? 0 : (olaRate === undefined ? null : olaRate * s.olaAmount);

      var adgRate = age <= 14 ? R.ADG_RATES.child[oi] : age === 15 ? R.ADG_RATES.age15[oi] : R.ADG_RATES.adult[oi];
      var adhRate = age <= 14 ? R.ADH_RATES.child[oi]
        : age === 15 ? R.ADH_RATES.age15[oi]
        : age <= 44 ? R.ADH_RATES.age16to44[oi]
        : age <= 59 ? R.ADH_RATES.age45to59[oi]
        : R.ADH_RATES.age60to75[oi];

      var adg = adgRate * s.adgAmount;
      var tmr = effectiveTmr === 0 ? 0 : R.TMR_FIRST3[oi] + Math.max(0, effectiveTmr - 3) * R.TMR_EACH1[oi];
      var adm = R.ADM_RATES[oi] * (s.admDaily / 100);
      var adh = adhRate * effectiveAdh;

      var annual = { ola: ola, adg: adg, tmr: tmr, adm: adm, adh: adh };
      // 各期保費 = 年繳 × 繳別係數，各險種分別四捨五入後再加總
      var periodic = {
        ola: ola === null ? null : Math.round(ola * factor),
        adg: Math.round(adg * factor),
        tmr: Math.round(tmr * factor),
        adm: Math.round(adm * factor),
        adh: Math.round(adh * factor)
      };
      premiums = {
        annual: annual,
        periodic: periodic,
        total: periodic.ola === null ? null : periodic.ola + periodic.adg + periodic.tmr + periodic.adm + periodic.adh
      };
    }

    // ---- 骨折情境給付 ----
    // 骨折「不選」：無 ADH 骨折金／關懷金、無 ADM 未住院骨折給付；ADM 住院日額仍依實際住院日數（上限 maxHospitalDays）計入
    var adhFracture = bone ? Math.round(effectiveAdh * 1e4 * (bone.adh / 100) * fractureFactor) : 0; // ADH 骨折保險金
    var adhCare = Math.round(adhFracture * RULES.adhCareRatio);                            // ADH 2% 關懷金
    var boneDays = bone ? Math.round(bone.days * fractureFactor) : 0;
    var allowedHospitalDays = bone ? Math.min(Math.max(0, hospitalDays), boneDays) : hospitalDays;
    var remainingBoneDays = Math.max(0, boneDays - allowedHospitalDays);
    var admHospital = allowedHospitalDays * s.admDaily;                                     // ADM 住院日額
    var admBoneSupport = Math.round(remainingBoneDays * s.admDaily * RULES.admBoneSupportRatio); // ADM 未住院骨折
    var fixedFractureTotal = adhFracture + adhCare + admHospital + admBoneSupport;

    // ---- 脫臼情境（選填）：ADH 保額 × 脫臼別表比例；無關懷金；須實際施行開放性復位術；同一事故僅給付最高一項 ----
    var joint = s.jointId ? findJoint(s.jointId) : null;
    var dislocation = joint ? Math.round(effectiveAdh * 1e4 * joint.pct / 100) : 0;
    var fixedTotalWithJoint = fixedFractureTotal + dislocation;

    // ---- 保障彙整 ----
    var accidentDeathTotal = (s.adgAmount + effectiveAdh) * 1e4;
    var disabilityTotal = s.adgAmount + effectiveAdh; // 萬元
    var majorBurnTotal = (s.adgAmount * RULES.burn.adg + effectiveAdh * RULES.burn.adh) * 1e4;

    var ageError = age < 0 ? "請輸入正確的民國生日（6或7碼）"
      : age > RULES.maxEntryAge ? "附約投保年齡目前以 0～" + RULES.maxEntryAge + " 歲為限" : "";
    var olaError = !s.hasExistingMain && age >= 0 && premiums && premiums.annual.ola === null
      ? s.olaTerm + "年期不適用目前年齡，請改選其他繳費年期" : "";

    return {
      age: age, pay: pay, maxAdh: maxAdh, effectiveAdh: effectiveAdh, tmrMax: tmrMax, effectiveTmr: effectiveTmr,
      bone: bone, fracture: fracture, hospitalDays: hospitalDays, premiums: premiums,
      adhFracture: adhFracture, adhCare: adhCare, allowedHospitalDays: allowedHospitalDays,
      remainingBoneDays: remainingBoneDays, admHospital: admHospital, admBoneSupport: admBoneSupport,
      fixedFractureTotal: fixedFractureTotal, joint: joint, dislocation: dislocation, fixedTotalWithJoint: fixedTotalWithJoint,
      accidentDeathTotal: accidentDeathTotal,
      disabilityTotal: disabilityTotal, majorBurnTotal: majorBurnTotal,
      ageError: ageError, olaError: olaError,
      existingMainWarning: s.hasExistingMain && !s.existingMainChecked
    };
  }

  /* ======================= 畫面 ======================= */

  var state = JSON.parse(JSON.stringify(R.DEFAULTS));
  var $ = function (id) { return document.getElementById(id); };

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fillOptions(sel, items) {
    sel.innerHTML = items.map(function (it) {
      return '<option value="' + esc(it[0]) + '">' + esc(it[1]) + "</option>";
    }).join("");
  }

  // 與原工具相同：數字欄位只在數值不同時才覆寫（避免打字時游標跳動）
  function syncNumber(input, value) {
    if ((value === 0 && input.value === "") || input.value != value) input.value = String(value);
  }
  function syncText(input, value) {
    if (input.value !== String(value)) input.value = String(value);
  }
  function showText(el, text) {
    el.hidden = !text;
    el.textContent = text || "";
  }

  function benefitRow(number, title, amount, note, accent) {
    return '<div class="benefit-row' + (accent ? " benefit-row--accent" : "") + '">' +
      '<span class="benefit-number">' + number + "</span>" +
      '<div class="benefit-copy"><strong>' + esc(title) + "</strong><small>" + esc(note) + "</small></div>" +
      "<b>" + esc(amount) + "</b></div>";
  }

  function render() {
    var s = state;
    var c = compute(s);
    var p = c.premiums;
    var adg = s.adgAmount, adm = s.admDaily, adhE = c.effectiveAdh, tmrE = c.effectiveTmr;

    // ---- 左側輸入欄同步 ----
    syncText($("name"), s.name);
    syncText($("rocBirth"), s.rocBirth);
    $("gender").value = s.gender;
    $("occupation").value = String(s.occupation);
    $("payMode").value = s.payMode;
    $("hasExistingMain").checked = s.hasExistingMain;
    $("existingMainChecked").checked = s.existingMainChecked;
    $("existingMainRow").hidden = !s.hasExistingMain;
    $("olaFields").hidden = s.hasExistingMain;
    $("olaTerm").value = s.olaTerm;
    syncNumber($("olaAmount"), s.olaAmount);
    syncNumber($("adgAmount"), s.adgAmount);
    $("tmrAmount").max = String(c.tmrMax);
    syncNumber($("tmrAmount"), s.tmrAmount);
    syncNumber($("admDaily"), s.admDaily);
    $("adhAmount").max = String(c.maxAdh);
    syncNumber($("adhAmount"), s.adhAmount);
    $("boneId").value = s.boneId || "";
    $("fractureType").value = s.fractureType;
    $("fractureType").disabled = !s.boneId; // 骨折「不選」時骨折程度停用
    $("jointId").value = s.jointId || "";
    syncText($("hospitalDays"), s.hospitalDaysInput);

    showText($("ageError"), c.ageError);
    showText($("olaError"), c.olaError);
    showText($("tmrError"), s.tmrAmount !== tmrE ? "目前依規則以 " + tmrE + " 萬元試算" : "");
    $("adhNote").textContent = "0＝不投保｜上限 " + c.maxAdh + " 萬元";
    showText($("adhError"), s.adhAmount !== adhE ? "已依搭配規則改以 " + adhE + " 萬元試算" : "");

    // ---- 右側：保障彙整圖 ----
    var deathSrc = [adg > 0 ? "ADG " + money.format(adg) + "萬" : "", adhE > 0 ? "ADH " + money.format(adhE) + "萬" : ""].filter(Boolean);
    var burnSrc = [adg > 0 ? "ADG 依程度 10%／40%" : "", adhE > 0 ? "ADH 25%" : ""].filter(Boolean);
    var disSrc = [adg > 0 ? "ADG" : "", adhE > 0 ? "ADH" : ""].filter(Boolean);
    var disNote = disSrc.join("＋") + " 依失能等級 5%～100%" + (disSrc.length > 1 ? " 合計" : "") + "試算";

    var olaPeriodic = p ? p.periodic.ola : undefined;
    var totalText = (!p || p.total === null) ? "待確認" : "$" + money.format(p.total);
    var alert = c.existingMainWarning ? "請先確認原主約效期與附約搭配額度。" : (c.olaError || c.ageError);
    var per = function (k) { return "$" + money.format(p ? p.periodic[k] : 0); };

    var html = "";
    html += '<div class="quote-head"><div>' +
      "<span>保障彙整圖</span>" +
      "<h2>" + esc(s.name || "未填姓名") + " 的意外險全方面保障</h2>" +
      "<p>" + (c.age >= 0 ? "保險年齡 " + c.age + " 歲" : "年齡待確認") + "｜" + (s.gender === "female" ? "女性" : "男性") +
      "｜職業第 " + s.occupation + " 類｜" + esc(c.pay.label) + "</p></div>" +
      '<div class="premium-total"><small>' + esc(c.pay.suffix) + "合計保費</small><strong>" + totalText + "</strong><span>元</span></div></div>";

    if (alert) html += '<div class="alert-strip">' + esc(alert) + "</div>";

    html += '<div class="coverage-wheel"><div class="wheel-core"><b>5 層保障</b><small>保費＋保障一次看懂</small></div><div class="wheel-products">';
    html += "<div><span>OLA6</span><b>" + (s.hasExistingMain ? "沿用原主約" : s.olaAmount + "萬壽險") + "</b><small>" +
      (olaPeriodic === null ? "年期待調整" : s.hasExistingMain ? "不計新主約保費" : "$" + money.format(olaPeriodic == null ? 0 : olaPeriodic)) + "</small></div>";
    html += '<div class="' + (adg === 0 ? "is-not-covered" : "") + '"><span>ADG</span><b>' + (adg === 0 ? "不投保" : adg + "萬意外身故") +
      "</b><small>" + (adg === 0 ? "未計保費" : per("adg")) + "</small></div>";
    html += '<div class="' + (tmrE === 0 ? "is-not-covered" : "") + '"><span>TMR</span><b>' + (tmrE === 0 ? "不投保" : tmrE + "萬意外實支") +
      "</b><small>" + (tmrE === 0 ? "未計保費" : per("tmr")) + "</small></div>";
    html += '<div class="' + (adm === 0 ? "is-not-covered" : "") + '"><span>ADM</span><b>' + (adm === 0 ? "不投保" : money.format(adm) + "元／日") +
      "</b><b>意外住院日額</b><small>" + (adm === 0 ? "未計保費" : per("adm")) + "</small></div>";
    html += '<div class="' + (adhE === 0 ? "is-not-covered" : "is-adh") + '"><span>ADH</span><b>' + (adhE === 0 ? "不投保" : adhE + "萬骨折保障") +
      "</b><small>" + (adhE === 0 ? "未計保費" : per("adh")) + "</small></div>";
    html += "</div></div>";

    html += '<div class="benefit-list">';
    html += benefitRow("1", "意外身故",
      c.accidentDeathTotal === 0 ? "不投保" : wan.format(c.accidentDeathTotal / 1e4) + " 萬",
      c.accidentDeathTotal === 0 ? "此保障項目未投保" : deathSrc.join("＋") + "，符合各附約條款時" + (deathSrc.length > 1 ? "合計" : "試算"));
    html += benefitRow("2", "重大燒燙傷",
      c.majorBurnTotal === 0 ? "不投保" : "最高 " + wan.format(c.majorBurnTotal / 1e4) + " 萬",
      c.majorBurnTotal === 0 ? "此保障項目未投保" : burnSrc.join("＋") + "，符合各附約條款時" + (burnSrc.length > 1 ? "合計" : "試算"));
    html += benefitRow("3", "意外失能",
      c.disabilityTotal === 0 ? "不投保" : wan.format(c.disabilityTotal * RULES.disabilityMinRatio) + "～" + wan.format(c.disabilityTotal) + " 萬",
      c.disabilityTotal === 0 ? "此保障項目未投保" : disNote);
    html += benefitRow("4", "意外醫療實支實付",
      tmrE === 0 ? "不投保" : "最高 " + tmrE + " 萬",
      tmrE === 0 ? "此方案未納入 TMR" : "TMR 同一次傷害、依實際醫療費用與條款限額給付");
    html += benefitRow("5", "意外住院／門診手術",
      adm === 0 ? "不投保" : "住院 " + money.format(adm) + "元／日｜門診手術 " + money.format(adm) + "元／次",
      adm === 0 ? "此方案未納入 ADM" : "ADM 門診手術每次意外傷害以一次為限");
    if (c.bone) html += benefitRow("6", c.bone.label + "｜" + c.fracture.label,
      adhE === 0 ? "不投保" : money.format(c.adhFracture + c.adhCare) + " 元",
      adhE === 0 ? "此方案未納入 ADH" : "ADH 骨折金 " + money.format(c.adhFracture) + "＋2%關懷金 " + money.format(c.adhCare),
      adhE > 0);
    if (c.joint) {
      html += '<div class="benefit-row benefit-row--joint' + (adhE > 0 ? " benefit-row--accent" : "") + '">' +
        '<span class="benefit-number">' + (c.bone ? 7 : 6) + "</span>" +
        '<div class="benefit-copy"><strong>' + esc("脫臼開放性復位術｜" + c.joint.label) + "</strong><small>" +
        esc(adhE === 0 ? "此方案未納入 ADH" : "ADH " + money.format(adhE) + " 萬 × " + c.joint.pct + "%｜需實際施行開放性復位術") + "</small></div>" +
        "<b>" + esc(adhE === 0 ? "未投保 ADH" : money.format(c.dislocation) + " 元") + "</b></div>";
    }
    html += "</div>";

    var calcTitle = c.bone ? "骨折可領多少？" : c.joint ? "脫臼可領多少？" : "意外住院可領多少？";
    var totalLabel = c.bone && c.joint ? "定額給付合計試算（骨折＋脫臼）" : c.joint ? "定額給付合計試算（脫臼）" : "定額給付合計試算";
    html += '<div class="fracture-calculation"><div class="fracture-title"><span>' + calcTitle + '</span><h3>符合條款定義的 情境試算</h3></div>' +
      '<div class="calculation-grid' + (c.joint ? " has-joint" : "") + (c.bone ? "" : " no-bone") + '">' +
      (c.bone ? "<div><small>ADH 骨折＋關懷金</small><b>" + money.format(c.adhFracture + c.adhCare) + "</b><span>元</span></div>" : "") +
      "<div><small>ADM 住院 " + c.allowedHospitalDays + " 日</small><b>" + (adm === 0 ? "未投保" : money.format(c.admHospital)) + "</b>" + (adm !== 0 ? "<span>元</span>" : "") + "</div>" +
      (c.bone ? "<div><small>ADM 未住院骨折給付</small><b>" + (adm === 0 ? "未投保" : money.format(c.admBoneSupport)) + "</b>" + (adm !== 0 ? "<span>元</span>" : "") + "</div>" : "") +
      (c.joint ? '<div class="calc-joint"><small>脫臼開放性復位術｜' + esc(c.joint.label) + "</small><b>" + (adhE === 0 ? "未投保 ADH" : money.format(c.dislocation)) + "</b>" + (adhE !== 0 ? "<span>元</span>" : "") + "<em>需實際施行開放性復位術</em></div>" : "") +
      '<div class="calculation-total"><small>' + totalLabel + "</small><b>" + money.format(c.joint ? c.fixedTotalWithJoint : c.fixedFractureTotal) + "</b><span>元</span></div>" +
      "</div><p>" + (tmrE === 0 ? "本方案未投保 TMR。"
        : '<strong class="tmr-highlight">另有 TMR 意外醫療實支實付最高 ' + tmrE + " 萬元</strong><span>，依實際費用及條款審核，不列入定額合計。</span>") +
      "</p></div>";

    html += '<div class="quote-footnotes"><strong>試算依據與重要提醒</strong>' +
      "<p>附約須搭配有效主約；OLA6 最低 " + RULES.ola6.min + " 萬元。附約額度與搭配規定仍須覆核。</p>" +
      "<p>本頁僅供試算；實際承保、保費與理賠，以正式文件及富邦人壽審核為準。</p></div>";

    $("quoteCard").innerHTML = html;
    renderChart(c);
    renderCallout(c);
  }

  /* ---------------- 骨折／脫臼互動圖（Q 版骨頭人）：標示目前選擇的骨折（或脫臼）部位 ----------------
   * 位置資料在 rates.js 的 BONE_CHART／JOINT_CHART（百分比），圖片縮放時會自動對齊。
   * 只在部位／程度／ADH 金額改變時才重畫，避免輸入其他欄位時動畫一直重播。
   * 圖上有兩種模式：
   *   骨折（預設）：跟著左側「骨折部位」，金額＝報價卡「骨折」那一列（ADH 骨折金＋2% 關懷金）
   *   脫臼：點圖右欄的關節時進入；金額＝ADH 保險金額 × 脫臼別表比例（只顯示在圖上與說明卡，不影響報價卡）
   *   點左欄骨折部位、或變更「骨折部位／骨折程度」選單，就回到骨折模式。 */
  var lastChartKey = "";
  var chartView = { mode: "bone", jointId: null };

  function pctText(v) { return Number(v.toFixed(2)) + "%"; } // 例：0.75%、30%

  function factorText(f) { // 1/2、1/4 等分數顯示
    if (f === 1) return "";
    var inv = 1 / f;
    return Math.abs(inv - Math.round(inv)) < 1e-9 ? "1/" + Math.round(inv) : String(f);
  }

  function findJoint(id) {
    for (var i = 0; i < R.JOINTS.length; i++) if (R.JOINTS[i].id === id) return R.JOINTS[i];
    return null;
  }

  // 意外傷害脫臼開放性復位術保險金 = ADH 保險金額 × 脫臼別表比例（DM 第 2 頁；無關懷金）
  function dislocationBenefit(c, joint) {
    return Math.round(c.effectiveAdh * 10000 * joint.pct / 100);
  }

  // 圖上目前「展開氣泡／說明卡」的是脫臼（mode=joint）還是骨折；脫臼選取本身存在 state.jointId（與左欄「脫臼部位」選單同步）
  function currentJoint() {
    return chartView.mode === "joint" ? findJoint(state.jointId) : null;
  }

  function overlayHtml(pos, label, pctHtml, smallHtml, payHtml) {
    var b = pos.box, l = pos.line, html = "";
    if (l) {
      html += '<svg class="chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none">' +
        '<line class="chart-line-glow" x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '"/>' +
        '<line class="chart-line-core" x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '"/>' +
        "</svg>";
    }
    // 選取框改由標籤本身（.chart-pill.is-active）顯示，寬度與標籤完全一致
    if (l) html += '<span class="chart-dot" style="left:' + l[2] + "%;top:" + l[3] + '%"></span>';
    var below = b[1] < 14; // 太靠近圖頂：氣泡改放在標籤下方
    var leftCol = b[0] < 50; // 左欄（骨折）氣泡靠標籤左緣往右展開；右欄（脫臼）靠標籤右緣往左展開，長名稱也不會超出圖框
    html += '<span class="chart-bubble' + (below ? " is-below" : "") + (leftCol ? " is-left" : "") + '" style="left:' + (leftCol ? b[0] : b[0] + b[2]) + "%;top:" + (below ? b[1] + b[3] : b[1]) + '%">' +
      '<span class="chart-bubble-name">' + esc(label) + "</span>" +
      "<b>" + pctHtml + "</b>" + (smallHtml || "") +
      '<em class="chart-bubble-pay">' + payHtml + "</em></span>";
    return html;
  }

  /* ---------------- 互動圖的固定圖層：部位標籤、引線、圓點 ----------------
   * 名稱與比例全部取自 R.BONES（adh %）與 R.JOINTS（pct %），位置取自 R.BONE_CHART／R.JOINT_CHART；
   * 骨頭人圖片本身沒有任何文字。只在初始化時產生一次。 */
  // 標籤、引線、圓點一律為 DM 樣式的單一顏色（白底名稱＋綠色比例格），顏色在 style.css 的 .chart-stage 變數設定

  function pillHtml(kind, id, label, pctText, pos) {
    var b = pos.box, m = /^(.*?)（(.*)）$/.exec(label);
    var name = m ? esc(m[1]) + "<small>(" + esc(m[2]) + ")</small>" : esc(label);
    return '<span class="chart-pill is-' + kind + (m ? " has-sub" : "") + '" data-kind="' + kind + '" data-id="' + esc(id) + '" title="' + esc(label + " " + pctText) + '"' +
      // 寬度至少為 box 寬；字太長（窄螢幕）時往圖中央延伸：骨折標籤往右、脫臼標籤往左
      ' style="' + (kind === "joint" ? "right:" + Math.round((100 - b[0] - b[2]) * 100) / 100 : "left:" + b[0]) + "%;top:" + b[1] + "%;min-width:" + b[2] + "%;height:" + b[3] + '%">' +
      '<span class="pill-name">' + name + '</span><b class="pill-pct">' + pctText + "</b></span>";
  }

  function buildChartLabels() {
    var F = R.CHART_FIGURE, lines = "", dots = "", pills = "";
    function add(kind, id, label, pctText, pos) {
      if (!pos) return;
      pills += pillHtml(kind, id, label, pctText, pos);
      var l = pos.line;
      if (!l) return;
      lines += '<line x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '"/>';
      dots += '<span class="chart-pin" style="left:' + l[2] + "%;top:" + l[3] + '%"></span>';
    }
    R.BONES.forEach(function (b, i) { add("bone", b.id, b.label, b.adh + "%", R.BONE_CHART[b.id]); });
    R.JOINTS.forEach(function (j, i) { add("joint", j.id, j.label, j.pct + "%", R.JOINT_CHART[j.id]); });
    var html = '<svg class="chart-leaders" viewBox="0 0 100 100" preserveAspectRatio="none">' + lines + "</svg>" + dots + pills;
    var stages = document.querySelectorAll(".chart-stage");
    for (var i = 0; i < stages.length; i++) {
      var st = stages[i], layer = st.querySelector(".chart-labels"), img = st.querySelector("img");
      if (F) {
        st.style.aspectRatio = "100 / " + F.aspect;
        if (img) img.style.cssText = "left:" + F.left + "%;top:" + F.top + "%;width:" + F.width + "%";
        // 分類標題的左右分界與中間虛線：對齊骨頭人中線
        var mid = Math.round((F.left + F.width / 2) * 100) / 100;
        var thumb = st.parentNode;
        if (thumb && thumb.style) thumb.style.setProperty("--chart-split", mid + "%");
      }
      if (layer) layer.innerHTML = html;
    }
  }

  function renderChart(c) {
    var joint = currentJoint();
    var key = joint
      ? ["joint", joint.id, c.effectiveAdh].join("|")
      : ["bone", c.bone ? c.bone.id : "", state.fractureType, c.effectiveAdh, c.adhFracture, state.jointId || ""].join("|");
    if (key === lastChartKey) return;
    lastChartKey = key;

    var overlay = "";
    if (joint) {
      overlay = overlayHtml(R.JOINT_CHART[joint.id], joint.label, joint.pct + "%", "",
        c.effectiveAdh > 0 ? "理賠 " + money.format(dislocationBenefit(c, joint)) + " 元" : "未投保 ADH");
    } else {
      var bone = c.bone, f = c.fracture.factor, pos = bone && R.BONE_CHART[bone.id]; // 骨折「不選」→ 不顯示氣泡
      if (pos) {
        overlay = overlayHtml(pos, bone.label, bone.adh + "%",
          f !== 1 ? "<small>" + esc(c.fracture.label) + " " + pctText(bone.adh * f) + "</small>" : "",
          // 理賠金額＝報價卡「骨折」那一列的金額（ADH 骨折金＋2% 關懷金），不另外計算
          c.effectiveAdh > 0 ? "理賠 " + money.format(c.adhFracture + c.adhCare) + " 元" : "未投保 ADH");
      }
    }
    // 骨折與脫臼可同時選取：骨折標籤一律標示目前骨折部位；有選脫臼部位時，該關節標籤也標示
    var pills = document.querySelectorAll(".chart-pill");
    for (var k = 0; k < pills.length; k++) {
      var kd = pills[k].getAttribute("data-kind"), pid = pills[k].getAttribute("data-id");
      pills[k].classList.toggle("is-active", kd === "bone" ? !!c.bone && pid === c.bone.id : pid === (state.jointId || ""));
      pills[k].classList.toggle("is-joint-mode", !!joint && kd === "joint");
    }
    var boxes = document.querySelectorAll(".chart-overlay");
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].innerHTML = overlay;
      boxes[i].classList.toggle("is-joint", !!joint);
    }
  }

  // 右側說明卡：每次都更新（含 ADM 住院日數等，數字全部取自報價卡同一份計算結果 c）
  function renderCallout(c) {
    var callout = $("chartCallout");
    if (!callout) return;
    var joint = currentJoint();
    var adh = c.effectiveAdh > 0, adm = state.admDaily > 0;
    var row = function (label, value, cls) {
      return '<div class="' + (cls || "") + '"><dt>' + label + "</dt><dd>" + value + "</dd></div>";
    };
    var yuan = function (v) { return money.format(v) + " 元"; };
    callout.classList.toggle("is-joint", !!joint);

    if (joint) { // ---- 脫臼模式 ----
      var amt = dislocationBenefit(c, joint);
      callout.innerHTML =
        '<span class="callout-label">目前脫臼部位</span>' +
        '<div class="callout-main"><strong>' + esc(joint.label) + "</strong><b>" + joint.pct + "%</b></div>" +
        "<em>脫臼開放性復位術 → 保險金額 × " + joint.pct + "%</em>" +
        "<em>" + (adh
          ? "ADH " + money.format(c.effectiveAdh) + " 萬 × " + joint.pct + "% → <mark>" + yuan(amt) + "</mark>"
          : "目前未投保 ADH") + "</em>" +
        '<dl class="callout-pay">' +
          (adh ? row("脫臼開放性復位術保險金", yuan(amt), "is-total") : row("ADH", "未投保 ADH", "is-muted")) +
        "</dl>" +
        '<p class="callout-note">須經醫師診斷必須且實際施行脫臼開放性復位術；同一事故僅給付一項較高比例。脫臼不另給付 2% 關懷金。</p>' +
        '<p class="callout-dm">DM：「意外傷害脫臼開放性復位術保險金：保險金額x脫臼別表(10%~30%)，同一意外傷害事故僅給付一次。」' +
        "註2：「如因同一意外傷害事故致成二項以上脫臼經醫師診斷必須且實際施行二項以上之『脫臼開放性復位術』治療者，" +
        "富邦人壽僅給付一項較高比例之意外傷害脫臼開放性復位術保險金。」詳細給付內容及條件限制，請參閱保單條款。</p>" +
        '<p class="callout-back">已計入報價卡「脫臼開放性復位術」與定額給付合計；點圖左欄骨折部位即回到骨折試算，左側「脫臼部位」選「不選」即取消。</p>';
      return;
    }

    if (!c.bone) { // ---- 骨折、脫臼都「不選」（或骨折不選且停在骨折模式）----
      callout.innerHTML = '<span class="callout-label">目前未選擇部位</span>' +
        '<div class="callout-main callout-empty"><strong>點圖上部位或在左側選擇</strong></div>' +
        "<em>點骨頭人左欄骨折、右欄脫臼部位，即可看理賠金額。</em>" +
        (adm && c.admHospital ? '<dl class="callout-pay">' + row("ADM 住院 " + c.allowedHospitalDays + " 日", yuan(c.admHospital)) + row("定額給付合計", yuan(c.fixedTotalWithJoint), "is-total") + "</dl>" : "");
      return;
    }
    // ---- 骨折模式（與報價卡相同數字）----
    var bone = c.bone, f = c.fracture.factor, eff = bone.adh * f;
    var pay = "";
    if (adh) {
      pay += row("ADH 骨折保險金", yuan(c.adhFracture));
      pay += row("2% 關懷金", yuan(c.adhCare));
      pay += row("ADH 理賠小計", yuan(c.adhFracture + c.adhCare), "is-sub");
    } else {
      pay += row("ADH", "未投保 ADH", "is-muted");
    }
    if (adm) {
      pay += row("ADM 住院 " + c.allowedHospitalDays + " 日", yuan(c.admHospital));
      pay += row("ADM 未住院骨折給付", yuan(c.admBoneSupport));
    }
    if (c.joint) pay += row("脫臼開放性復位術｜" + esc(c.joint.label), adh ? yuan(c.dislocation) : "未投保 ADH", adh ? "" : "is-muted");
    if (adm || adh) pay += row(c.joint ? "定額給付合計（骨折＋脫臼）" : "定額給付合計", yuan(c.joint ? c.fixedTotalWithJoint : c.fixedFractureTotal), "is-total");
    callout.innerHTML =
      '<span class="callout-label">目前骨折部位</span>' +
      '<div class="callout-main"><strong>' + esc(bone.label) + "</strong><b>" + bone.adh + "%</b></div>" +
      "<em>" + esc(c.fracture.label) + " → 保險金額 × " +
        (f === 1 ? bone.adh + "%" : bone.adh + "% × " + factorText(f) + " = <mark>" + pctText(eff) + "</mark>") + "</em>" +
      "<em>" + (adh
        ? "ADH " + money.format(c.effectiveAdh) + " 萬 → 骨折保險金 <mark>" + money.format(c.adhFracture) + " 元</mark>"
        : "目前未投保 ADH") + "</em>" +
      '<dl class="callout-pay">' + pay + "</dl>";
  }

  /* ---------------- 點圖上的部位 → 直接選取、顯示理賠金額 ----------------
   * 用 BONE_CHART／JOINT_CHART 的百分比位置做點擊判定：點在標籤框上（或框旁幾 px 內），
   * 或點在骨頭／關節上的引線端點附近，就選取最近的部位。兩個骨折部位共用同一端點時（橈骨／脛骨），
   * 連點會在兩者間切換。點到圖上空白處不做任何事。 */
  var coarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  // 回傳 { kind: "bone" | "joint", id } 或 null
  function hitTarget(stage, clientX, clientY) {
    var r = stage.getBoundingClientRect();
    if (!r.width) return null;
    var x = clientX - r.left, y = clientY - r.top;
    if (x < 0 || y < 0 || x > r.width || y > r.height) return null;
    // 容許誤差（px）：點在標籤／比例格外圍這個距離內也算；相鄰標籤以「最近者」為準，不會選錯
    var tolBox = coarsePointer ? 16 : 12, tolDot = coarsePointer ? 26 : 18;
    var best = null, groups = {};
    function test(kind, table) {
      Object.keys(table).forEach(function (id) {
        var p = table[id], b = p.box, l = p.line;
        var bx = b[0] / 100 * r.width, by = b[1] / 100 * r.height, bw = b[2] / 100 * r.width, bh = b[3] / 100 * r.height;
        var dBox = Math.hypot(Math.max(bx - x, 0, x - bx - bw), Math.max(by - y, 0, y - by - bh));
        if (dBox <= tolBox && (!best || dBox < best.d)) best = { kind: kind, id: id, d: dBox, dot: null };
        if (!l) return; // 「其他關節」沒有引線
        var dDot = Math.hypot(x - l[2] / 100 * r.width, y - l[3] / 100 * r.height);
        var key = kind + ":" + l[2] + "," + l[3];
        (groups[key] = groups[key] || []).push(id);
        if (dDot <= tolDot && (!best || dDot < best.d)) best = { kind: kind, id: id, d: dDot, dot: key };
      });
    }
    test("bone", R.BONE_CHART);
    test("joint", R.JOINT_CHART);
    if (!best) return null;
    if (best.dot && best.kind === "bone") { // 共用端點：已選其中一個時，再點一次換下一個
      var g = groups[best.dot], cur = chartView.mode === "bone" ? g.indexOf(state.boneId) : -1;
      return { kind: "bone", id: cur >= 0 ? g[(cur + 1) % g.length] : g[0] };
    }
    return { kind: best.kind, id: best.id };
  }

  function selectBone(id) {
    if (!id || !R.BONE_CHART[id]) return;
    state.boneId = id; // 與左側「骨折部位」下拉選單相同效果
    chartView.mode = "bone";
    render();
  }

  function selectJoint(id) {
    if (!findJoint(id)) return;
    state.jointId = id; // 與左側「脫臼部位」選單相同效果（計入報價卡）
    chartView.mode = "joint"; chartView.jointId = id;
    render();
  }

  function initChartClicks() {
    var stages = document.querySelectorAll(".chart-stage");
    for (var i = 0; i < stages.length; i++) (function (stage) {
      var hover = document.createElement("span");
      hover.className = "chart-hover"; hover.hidden = true;
      stage.appendChild(hover);
      stage.addEventListener("mousemove", function (e) {
        var t = hitTarget(stage, e.clientX, e.clientY);
        stage.classList.toggle("is-over-bone", !!t);
        hover.hidden = !t;
        if (!t) { stage.removeAttribute("title"); return; }
        var isJoint = t.kind === "joint";
        var b = (isJoint ? R.JOINT_CHART : R.BONE_CHART)[t.id].box;
        var item = isJoint ? findJoint(t.id) : findBone(t.id);
        hover.classList.toggle("is-joint", isJoint);
        hover.style.cssText = "left:" + b[0] + "%;top:" + b[1] + "%;width:" + b[2] + "%;height:" + b[3] + "%";
        stage.title = item.label + " " + (isJoint ? item.pct + "%（脫臼開放性復位術）" : item.adh + "%") + "：點一下看理賠金額";
      });
      stage.addEventListener("mouseleave", function () { hover.hidden = true; stage.classList.remove("is-over-bone"); });
    })(stages[i]);
  }

  /* ---------------- 左欄「客戶理賠案例」（資料：rates.js 的 CASES） ---------------- */
  var activeCase = 0;

  function renderCaseShare() {
    var cases = R.CASES || [], tabs = $("caseTabs"), body = $("caseBody");
    if (!tabs || !body || !cases.length) return;
    tabs.innerHTML = cases.map(function (k, i) {
      return '<button type="button" role="tab" class="case-tab' + (i === activeCase ? " is-active" : "") + '" aria-selected="' + (i === activeCase) +
        '" data-case="' + i + '">客戶案例' + k.no + '<small>' + esc(k.title) + '</small></button>';
    }).join("");
    var k = cases[activeCase];
    var existingSum = k.existing.reduce(function (a, e) { return a + e[1]; }, 0);
    body.innerHTML =
      '<div class="case-title"><span class="case-no">客戶案例' + k.no + '</span><strong>' + esc(k.title) + '</strong></div>' +
      (k.story ? '<p class="case-story">' + esc(k.story) + '</p>' : "") +
      '<dl class="case-facts">' +
        '<div><dt>部位</dt><dd>' + esc(k.part) + '</dd></div>' +
        '<div><dt>骨折程度</dt><dd>' + esc(k.fracture) + '</dd></div>' +
        '<div><dt>收據總費用</dt><dd>' + money.format(k.receipts) + ' 元' + (k.receiptsNote ? '<small>（' + esc(k.receiptsNote) + '）</small>' : "") + '</dd></div>' +
      '</dl>' +
      '<p class="case-calc">' + esc(k.calc) + ' = <b>' + money.format(k.claim) + ' 元</b></p>' +
      '<div class="case-pay"><span>ADH 骨力勇 保額 ' + k.adhAmount + ' 萬 理賠</span><b>' + money.format(k.claim) + '</b><em>元</em></div>' +
      (k.flag ? '<p class="case-flag">ⓘ ' + esc(k.flag) + '</p>' : "") +
      '<div class="case-total"><p>如果有加骨折險，總計理賠就會來到 <b>' + money.format(k.grandTotal) + ' 元</b></p>' +
        '<small>＝ ADH ' + money.format(k.claim) + ' ＋ 原有保單理賠 ' + money.format(existingSum) + '（' +
        k.existing.map(function (e) { return esc(e[0]) + ' ' + money.format(e[1]); }).join("＋") + '）</small></div>' +
      '<button type="button" class="case-apply" data-apply="' + activeCase + '">套用此案例試算</button>' +
      '<p class="case-applied" id="caseApplied" hidden></p>';
    var prem = $("casePremium"), P = R.CASE_PREMIUM;
    if (prem && P) {
      var bands = [["14 歲（含）以下", R.ADH_RATES.child], ["16～44 歲", R.ADH_RATES.age16to44]];
      prem.innerHTML = '骨折險 ADH 保額 ' + P.adhAmount + ' 萬保費（職業第 ' + P.occupation + ' 類）' +
        bands.map(function (b) {
          var yr = b[1][P.occupation - 1] * P.adhAmount;
          return '<span class="case-prem-row">' + b[0] + '：年繳 <b>' + money.format(yr) + ' 元</b>，月繳 <b>' +
            money.format(Math.round(yr * R.PAY_MODES.month.factor)) + ' 元</b></span>';
        }).join("") +
        '<small>月繳＝年繳費率 × 0.088</small>';
    }
  }

  function applyCase(i) {
    var k = (R.CASES || [])[i];
    if (!k) return;
    var notes = [];
    // ADH 上限 = min(200 萬, OLA6 × 5)（未勾已有主約時）；不夠時把 OLA6 調到剛好夠的保額
    if (!state.hasExistingMain && state.olaAmount * RULES.adh.mainMultiple < k.adhAmount) {
      state.olaAmount = Math.max(RULES.ola6.min, Math.ceil(k.adhAmount / RULES.adh.mainMultiple));
      notes.push("OLA6 壽險保額已調為 " + state.olaAmount + " 萬（ADH " + k.adhAmount + " 萬需主約 ≥ " + state.olaAmount + " 萬）");
    }
    state.adhAmount = k.adhAmount;
    state.boneId = k.boneId;
    state.fractureType = k.fractureType;
    chartView.mode = "bone"; state.jointId = ""; // 客戶案例只有骨折，套用時取消脫臼選擇
    render();
    var c = compute(state), got = c.adhFracture + c.adhCare;
    var msg = "已套用客戶案例" + k.no + "：ADH " + k.adhAmount + " 萬、" + findBone(k.boneId).label + "、" + R.FRACTURE_TYPES[k.fractureType].label +
      " → 骨折理賠 " + money.format(got) + " 元";
    var out = $("caseApplied");
    if (out) { out.textContent = msg + (notes.length ? "；" + notes.join("；") : "") + "。"; out.hidden = false; }
    var card = $("chartThumb") || $("quoteCard"); // 骨頭人圖在報價卡上方，且氣泡直接顯示理賠金額 → 捲到圖
    if (card && card.scrollIntoView) { // 圖不在畫面內（例如手機版在下方）→ 捲過去看結果
      var r = card.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight - 120) card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function initCaseShare() {
    var box = $("caseShare");
    if (!box) return;
    renderCaseShare();
    box.addEventListener("click", function (e) {
      var tab = e.target.closest ? e.target.closest("[data-case]") : null;
      if (tab) { activeCase = Number(tab.getAttribute("data-case")); renderCaseShare(); return; }
      var btn = e.target.closest ? e.target.closest("[data-apply]") : null;
      if (btn) applyCase(Number(btn.getAttribute("data-apply")));
    });
  }

  /* ---------------- 事件綁定 ---------------- */
  function clampNum(v, min, max) { return Math.min(max, Math.max(min, Number(v))); }

  function init() {
    fillOptions($("occupation"), [1, 2, 3, 4, 5, 6].map(function (n) { return [n, "第 " + n + " 類"]; }));
    fillOptions($("payMode"), Object.keys(R.PAY_MODES).map(function (k) { return [k, R.PAY_MODES[k].label]; }));
    fillOptions($("olaTerm"), RULES.ola6.terms.map(function (t) { return [t, t + " 年"]; }));
    fillOptions($("boneId"), [["", "不選"]].concat(R.BONES.map(function (b) { return [b.id, b.label]; })));
    fillOptions($("jointId"), [["", "不選"]].concat(R.JOINTS.map(function (j) { return [j.id, j.label + "（" + j.pct + "%）"]; })));
    fillOptions($("fractureType"), Object.keys(R.FRACTURE_TYPES).map(function (k) { return [k, R.FRACTURE_TYPES[k].label]; }));
    $("olaAmount").min = String(RULES.ola6.min); $("olaAmount").max = String(RULES.ola6.max);
    $("adgAmount").max = String(RULES.adg.max); $("adgAmount").step = String(RULES.adg.step);
    $("admDaily").max = String(RULES.adm.max); $("admDaily").step = String(RULES.adm.step);
    $("adhAmount").step = String(RULES.adh.step);
    $("hospitalDays").max = String(RULES.maxHospitalDays);

    function on(id, ev, fn) { $(id).addEventListener(ev, function (e) { fn(e.target); render(); }); }
    on("name", "input", function (t) { state.name = t.value; });
    on("rocBirth", "input", function (t) { state.rocBirth = t.value; });
    on("gender", "change", function (t) { state.gender = t.value; });
    on("occupation", "change", function (t) { state.occupation = Number(t.value); });
    on("payMode", "change", function (t) { state.payMode = t.value; });
    on("hasExistingMain", "change", function (t) { state.hasExistingMain = t.checked; });
    on("existingMainChecked", "change", function (t) { state.existingMainChecked = t.checked; });
    on("olaTerm", "change", function (t) { state.olaTerm = t.value; });
    on("olaAmount", "input", function (t) { state.olaAmount = clampNum(t.value, 0, RULES.ola6.max); });
    on("olaAmount", "blur", function () { state.olaAmount = Math.max(RULES.ola6.min, state.olaAmount); }); // 離開欄位時補到最低 10 萬
    on("adgAmount", "input", function (t) { state.adgAmount = clampNum(t.value, 0, RULES.adg.max); });
    on("tmrAmount", "input", function (t) { state.tmrAmount = clampNum(t.value, 0, RULES.tmr.max); });
    on("admDaily", "input", function (t) { state.admDaily = clampNum(t.value, 0, RULES.adm.max); });
    on("adhAmount", "input", function (t) { state.adhAmount = clampNum(t.value, 0, compute(state).maxAdh); });
    on("boneId", "change", function (t) { state.boneId = t.value; chartView.mode = !t.value && state.jointId ? "joint" : "bone"; });
    on("fractureType", "change", function (t) { state.fractureType = t.value; chartView.mode = "bone"; });
    on("jointId", "change", function (t) {
      state.jointId = t.value;
      chartView.mode = t.value ? "joint" : "bone"; chartView.jointId = t.value || null;
    });
    on("hospitalDays", "input", function (t) { state.hospitalDaysInput = t.value; });
    on("hospitalDays", "blur", function () { state.hospitalDaysInput = String(compute(state).hospitalDays); });
    buildChartLabels();
    render();
    initChartPicker();
    initCaseShare();
  }

  /* ---------------- ADH 骨折別表：點圖上的部位（骨折或脫臼）→ 選取 ---------------- */
  function initChartPicker() {
    var thumb = $("chartThumb");
    if (!thumb) return;
    var stage = thumb.querySelector(".chart-stage");
    initChartClicks();
    stage.addEventListener("click", function (e) {
      var t = hitTarget(stage, e.clientX, e.clientY);
      if (!t) return; // 沒點到部位：不做任何事
      if (t.kind === "joint") selectJoint(t.id); else selectBone(t.id);
    });
  }

  // 對外提供計算函式（測試或日後擴充用）
  window.QuoteCalc = { parseRocBirth: parseRocBirth, compute: compute, getState: function () { return state; },
    getChartView: function () { return { mode: chartView.mode, jointId: chartView.jointId }; },
    applyCase: applyCase };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
