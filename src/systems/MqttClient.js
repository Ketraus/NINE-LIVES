export default class MqttClient {
  constructor(url, options) {
    if (!globalThis.mqtt?.connect) {
      throw new Error('MQTT.js não foi carregado.');
    }
    this.mqtt = globalThis.mqtt.connect(url, options);
  }

  get connected() {
    return this.mqtt.connected;
  }

  on(event, handler) {
    this.mqtt.on(event, handler);
  }

  off(event, handler) {
    if (typeof this.mqtt.off === 'function') {
      this.mqtt.off(event, handler);
    } else {
      this.mqtt.removeListener(event, handler);
    }
  }

  subscribe(topic, qos = 0) {
    return new Promise((resolve, reject) => {
      this.mqtt.subscribe(topic, { qos }, (error, granted) => {
        if (error) reject(error);
        else resolve(granted);
      });
    });
  }

  publish(topic, message, qos = 0) {
    this.mqtt.publish(topic, JSON.stringify(message), { qos, retain: false });
  }

  end(force = true) {
    this.mqtt.end(force);
  }
}