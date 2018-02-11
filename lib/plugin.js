/**
 * plugin.js
 */
const util = require("util");
const qr = require("querystring");

const protocol = require("./protocol");

module.exports = {
  params: {
    host: "192.168.0.14",
    port: 2424,
    pwd: "Jerome",
    setevton: true,
    setdaton: true
  },

  setParams(obj) {
    if (typeof obj == "object") {
      Object.keys(obj).forEach(param => {
        if (this.params[param] != undefined) this.params[param] = obj[param];
      });
    }
  },

  sendToServer(type, data) {
    process.send({ type, data });
  },

  sendDataToServer(payload) {
    if (!payload) return;

    let data;
    if (util.isArray(payload)) {
      data = payload;
    } else if (typeof payload == "string") {
      // adr=val&adr=val&... => {adr:val, ..}
      let robj = qr.parse(payload);

      // Преобразуем {adr:val, ..} => [{id:'1', value:'1'}]
      // ЕСЛИ adr повторяется - то создается массив значений! {'IN_1':['1','0']..}!
      // В этом случае берем последнее значение
      if (robj) {
        data = Object.keys(robj).map(adr => ({
          id: adr,
          value: util.isArray(robj[adr]) ? robj[adr].pop() : robj[adr]
        }));
      }
    }
    if (!data) return;
    process.send({ type: "data", data });
  }
};
