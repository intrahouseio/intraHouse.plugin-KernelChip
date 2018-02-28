/**
 * Функции разбора и формирования данных
 */
const util = require("util");

exports.parse = parse;
exports.formCmdObj = formCmdObj;
exports.getInfMessage = getInfMessage;
exports.isError = isError;
exports.isChannelsRes = isChannelsRes;
exports.getResKey = getResKey;
exports.getStartMessages = getStartMessages;
exports.getChannels = getChannels;

function getInfMessage() {
  return { req: "INF", res: "#INF" };
}

function isError(str) {
  return str.indexOf("ERR") > 0;
}

function isChannelsRes(str) {
  return str == "#IO,ALL";
}

function getResKey(str) {
  let key = str;
  if (str.indexOf("#INF") == 0) {
    key = "#INF";
  }
  if (str.indexOf("#IO,ALL") == 0) {
    key = "#IO,ALL";
  }
  return key;
}

function getStartMessages(jerome, params) {
  let res = [];

  res.push({ req: "PSW,SET," + params.pwd, res: "#PSW,SET,OK" });
  res.push({ req: "DAT,OFF", res: "#DAT,OK" });
  res.push({ req: "EVT,OFF", res: "#EVT,OK" });

  // Вкл-выкл подавления дребезга контактов - НЕТ ДЛЯ jerome
  if (!jerome) {
    res.push({
      req: "DZG," + (params.setdzgon ? "ON" : "OFF"),
      res: "#DZG,OK"
    });
  }

  // Получить конфигурацию дискретных io
  if (jerome) {
    res.push({ req: "IO,GET,ALL", res: "#IO,ALL" });
  }

  if (params.setevton) {
    res.push({ req: "EVT,ON", res: "#EVT,OK" });
  }

  if (params.setdaton) {
    res.push({ req: "DAT,ON", res: "#DAT,OK" });
  }
  return res;
}

/**
 * Возвращает массив каналов ТОЛЬКО для jerome, т к есть переменная часть - IO
 * Для других - channels в манифесте!!
 * @param {*} str
 */
function getChannels(str) {
  if (!str) return;
  // Разобрать строку IO,ALL,000111000111
  // Добавить стандартные каналы

  let confstr = str.split(",").pop();
  if (confstr.length != 22) {
    return "Expected 22 items in IO,ALL !!!";
  }

  return confstr
    .split("")
    .map((val, idx) => getIoItem(val, idx))
    .concat(constantChannels());
}

function getIoItem(val, idx) {
  let id = "IO_" + Number(idx + 1);
  let desc = val == 1 ? getInDesc(idx) : "OUT";
  return { id, desc };
}

// Первые четыре пина могут быть преключены в счетчики, остальные - дискретные входы
function getInDesc(idx) {
  return idx < 4 ? "IMPL" : "IN";
}

function constantChannels() {
  return [
    { id: "ADC_1", desc: "ADC" },
    { id: "ADC_2", desc: "ADC" },
    { id: "ADC_3", desc: "ADC" },
    { id: "ADC_4", desc: "ADC" },
    { id: "PWM", desc: "PWM" }
  ];
}

/** Обработка входных данных, м.б. несколько строк
 * Сюда пришла одна строка
 * #TIME,26240
 * #RD,ALL,100000
 * #RID,ALL,010000000000
 * #RDR,ALL,1000
 * #ADC,1,0.000
 * #ADC,2,0.000
 * #TMP,25.187
 * #INT,1,I,0,106
 **/
function parse(arrstr, switching, jerome) {
  let arrline = arrstr.split(",");
  if (!arrline) return;

  let res = "";
  let ridin = "";
  switch (arrline[0]) {
    case "#RD":
      if (arrline[1] == "ALL") {
        res = getDResult("IN_", arrline[2]);
      }
      break;

    case "#RID":
      if (arrline[1] == "ALL") {
        res = getDResult("OUT_", arrline[2]);
      }

      if (arrline[1] == "OUT" || arrline[1] == "IN") {
        res = getDResult("IO_", arrline[2]);
      }
      if (arrline[1] == "IN") ridin = arrline[2];
      break;

    case "#RDR":
      res = getDResult("REL_", arrline[2]);
      break;

    case "#TMP": // -273 - ошибка датчика, нужно передавать флаг ошибки
      if (arrline[1] > -270) {
        // res = getOneResult("TMP_", "1", arrline[1]);
        res = "TMP=" + arrline[1] + "&";
      }
      break;

    case "#ADC":
      if (arrline[1] == "ALL") {
        for (var j = 1; j < 5; j++) {
          res = res + getOneResult("ADC_", j, arrline[j + 1]);
        }
      } else {
        res = getOneResult("ADC_", arrline[1], arrline[2]);
      }
      break;

    case "#INT":
      // Если это выход, то устанавливать не надо!!
      if (jerome) {
        res = getJeromeIntResult("IMPL_", arrline[1], arrline[4]);
      } else {
        res = getOneResult("IMPL_", arrline[1], arrline[4]);
      }
      break;

    case "#EVT": //#EVT,IN,<time>,1,0
      if (jerome) {
        res = getJeromeEvtResult(arrline[1], arrline[3], arrline[4]);
      } else {
        res = getEvtResult(arrline[1], arrline[3], arrline[4]);
      }
      break;
  }
  return res;

  function getJeromeIntResult(pref, num, val) {
    if (num) {
      let i = Number(num);
      if (ridin && ridin.length >= i && ridin[i - 1] != "x") {
        return pref + String(num) + "=" + val + "&";
      }
    }
  }

  function getOneResult(pref, num, val) {
    if (num) {
      return pref + String(num) + "=" + val + "&";
    }
  }

  function getDResult(pref, vals) {
    var result = "",
      len = vals.length;

    for (var i = 0; i < len; i++) {
      if (isNaN(vals[i])) continue;

      if (!switching || !switching[pref + String(i + 1)]) {
        result = result + pref + String(i + 1) + "=" + vals[i] + "&";
      }
    }
    return result;
  }

  function getEvtResult(pref, num, val) {
    if (num) {
      return "IN_" + String(num) + "=" + val + "&";
    }
  }

  // EVT выдается только для входов
  // Если это счетчик (1-4) - то пропускаем
  function getJeromeEvtResult(pref, num, val) {
    if (num && num > 4) {
      return "IO_" + String(num) + "=" + val + "&";
    }
  }
}

function formCmdObj(pref, adr, val) {
  let robj = { done: pref + "_" + adr + "=" + val, ts: Date.now() };

  switch (pref) {
    case "OUT":
      robj.req = "WR," + adr + "," + val;
      robj.res = "#WR,OK";
      break;
    case "IO":
      robj.req = "WR," + adr + "," + val;
      robj.res = "#WR,OK";
      break;
    case "REL":
      robj.req = "REL," + adr + "," + val;
      robj.res = "#REL,OK";
      break;
    case "PWM":
      robj.req = "PWM,SET," + val;
      robj.res = "#PWM,SET,OK";
      break;
  }
  return robj;
}
