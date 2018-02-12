/**
 * kernelchip.js
 * TCP клиент для контроллеров Jerome, Laurent-2
 */
const util = require("util");

const logger = require("./lib/logger");
const plugin = require("./lib/plugin");
const agent = require("./lib/agent");

let step = 0;
plugin.unitId = process.argv[2];

// Определить тип контроллера. Jerome имеет переменные каналы, для других каналы прописаны в манифесте!
plugin.jerome = (plugin.unitId.indexOf('jerome') == 0);

logger.log("Plugin "+plugin.unitId+" has started.", "connect");
next();

function next() {
  switch (step) {
    case 0:
      // Запрос на получение параметров
      getTable("params");
      step = 1;
      break;
    case 1:
      // Подключение к контроллеру
      agent.start(plugin, logger);
      setInterval(checkResponse, 1000);
      step = 2;
      break;
    default:
  }
}

function getTable(name) {
  process.send({ type: "get", tablename: name + "/" + plugin.unitId });
}

// Проверка, что получен ответ  - потеря связи?
function checkResponse() {
  let res = agent.checkResponse();
  if (res) {
    logger.log(res);
    agent.stop();
    process.exit(2);
  }
}

/******************************** Входящие от IH ****************************************************/
process.on("message", function(message) {
  if (!message) return;
  if (typeof message == "string") {
    if (message == "SIGTERM") process.exit(0);
  }
  if (typeof message == "object" && message.type) {
    parseMessageFromServer(message);
  }
});

function parseMessageFromServer(message) {
  switch (message.type) {
    case "get":
      if (message.params) {
        plugin.setParams(message.params);
        if (message.params.debug) logger.setDebug(message.params.debug);
        next();
      }  
      break;

    case "act":
      doAct(message.data);
      break;

    case "debug":
      if (message.mode) logger.setDebug(message.mode);
      break;

    default:
  }
}

// data = [{id:adr, command:on/off/set, value:1}]
function doAct(data) {
  if (!data || !util.isArray(data) || data.length <= 0) return;

  data.forEach(item => {
    if (item.id && item.command) {
      let value = item.command == "on" ? 1 : 0;

      // Передать команду
      agent.doCommand(item.id, value);

      // и на сервер передать что сделали? или придет самотеком?
      // НЕТ!! ДОЛЖЕН ПРИДТИ ОТВЕТ - 
      plugin.sendDataToServer([{ id: item.id, value }]);
    }
  });
}

process.on("uncaughtException", function(err) {
  var text = "ERR (uncaughtException): " + util.inspect(err);
  logger.log(text);
});

process.on("disconnect", function() {
  agent.stop();
  process.exit();
});
