/**
 * agent.js
 * Работа с контроллером через tcp клиент
 */

const util = require("util");
const net = require("net");

const protocol = require("./protocol");

module.exports = {

  start(plugin, logger) {
    this.plugin = plugin;
    this.logger = logger;
    this.switching = {};
    this.waiting = [];

    this.tosend = protocol.getStartMessages(
      this.plugin.jerome,
      this.plugin.params
    );

    this.client = net.createConnection(
      { host: this.plugin.params.host, port: this.plugin.params.port },
      () => {
        this.logger.log(this.getHostPortStr() + " connected", "connect");
        this.sendNext();
      }
    );

    // Этот таймаут контролирует только прием данных, keepalive не учитывает
    this.client.setTimeout(30000, () => {
      this.tosend.push(protocol.getInfMessage());
      this.sendNext();
    });

    this.client.on("end", () => {
      logger.log("disconnected", "connect");
      process.exit(1);
    });

    this.client.on("error", e => {
      this.client.end();
      this.logger.log(this.getHostPortStr() + " connection error:" + e.code);
      process.exit(1);
    });

    this.client.on("data", data => {
      this.processInputData(data.toString());
      this.switching = {};
    });
  },

  processInputData(str) {
    this.logger.log("=> " + str, "in");

    let result = "";
    let arrstr = str.split(/\r\n/g);
    for (i = 0; i < arrstr.length; i++) {
      if (!arrstr[i]) continue;

      if (protocol.isError(arrstr[i])) {
        this.logger.log("ERROR! " + arrstr[i]);
        return;
      }

      if (arrstr[i].indexOf("#", 2) > 0) {
        // несколько ответов в одной строке: #RID,ALL,#PSW,SET,OK
        let arrsubstr = arrstr[i].split("#");
        for (var j = 0; j < arrsubstr.length; j++) {
          result += this.processDataItem("#" + arrstr[j]);
        }
      } else {
        result += this.processDataItem(arrstr[i]);
      }
    }
    if (result) {
      this.plugin.sendDataToServer(result);
    }
  },

  processDataItem(str) {
    return this.isWaiting(str) ? "" : protocol.parse(str, this.switching, this.plugin.jerome);
  },

  stop() {
    if (this.client) this.client.end();
  },

  sendNext() {
    if (this.tosend.length > 0) {
      let item = this.tosend.shift();
      if (item && item.req) {
        this.waiting.push({ req: item.req, res: item.res, ts: Date.now() });
        this.sendToUnit(item.req);
      }
    }
  },

  sendToUnit(command) {
    if (command) {
      this.logger.log("<= " + "$KE," + command, "out");
      this.client.write("$KE," + command + "\r\n");
    }
  },

  // Ответ не пришел, потеря связи?
  checkResponse() {
    if (this.waiting.length > 0) {
      let ts = Date.now();
      if (ts - this.waiting[0].ts > 500) {
        return (
          "Error: Sent " +
          this.waiting[0].req +
          ", expect " +
          this.waiting[0].res +
          ". No response for " +
          String(ts - this.waiting[0].ts) +
          " ms"
        );
      }
    }
  },

  isWaiting(str) {
    let key = protocol.getResKey(str);

    for (var i = 0; i < this.waiting.length; i++) {
      if (this.waiting[i].res == key) {
        // Ответ на команду
        if (protocol.isChannelsRes(key)) {
          // Пришла конфигурация - передать на сервер
          let data = protocol.getChannels(str);

          if (typeof data == 'object') {
              this.plugin.sendToServer("channels",data);
          } else {
              this.logger.log('ERROR getChannels: '+data);
          }   
        } else if (this.waiting[i].done) {
          this.plugin.sendDataToServer(this.waiting[i].done);
        }

        this.waiting.splice(i, 1);
        this.sendNext();
        return true;
      }
    }
  },

  getHostPortStr() {
    return this.plugin.params.host + ":" + this.plugin.params.port;
  },

  /** Команды управления
   *   Входное сообщение: adr='IO_1', val=1
   **/
  doCommand(adr, val) {
    let arra = adr.split("_");
    if (!arra) return;

    let cmdObj = protocol.formCmdObj(arra[0], arra[1], val);
    if (cmdObj && cmdObj.req) {
      this.waiting.push(cmdObj);
      this.sendToUnit(cmdObj.req);
      this.switching[arra[1]] = 1;
    }
  }
};
