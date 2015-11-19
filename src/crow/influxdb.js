"use strict";

import DeltaObserver from "./delta";

/*
 * observer that transforms a snapshot into a document in influxdb format,
 * and forwards that document to any downstream observers.
 *
 * Options: are passed to DeltaObserver.
 */
export class InfluxObserver {
  constructor(options = {}) {
    this.observers = [];
    this.options = options;
  }

  get observer() {
    const d = new DeltaObserver(this.options);
    d.addObserver(snapshot => this.generate(snapshot));
    return d.observer;
  }

  addObserver(observer) {
    this.observers.push(observer);
  }

  /*
   * generate the text body of a POST to influxdb to tell it about all our
   * juicy metrics.
   */
  generate(snapshot) {
    const lines = [ "# generated by crow " + snapshot.registry.version ];

    const map = snapshot.flatten((name, tags, subkey) => {
      if (subkey) tags = tags.merge({ p: subkey });
      const taglist = tags.format((k, v) => k + "=" + v, list => list.join(","));
      return name + (taglist.length > 0 ? "," + taglist : "");
    });

    for (const [ name, { value } ] of map) {
      // add zeros to timestamp to make it nanoseconds instead of milliseconds.
      lines.push(`${name} value=${value} ${snapshot.timestamp}000000`);
    }

    const document = lines.join("\n") + "\n";
    this.observers.forEach(observer => {
      try {
        observer(document);
      } catch (error) {
        console.log(error.stack);
      }
    });
  }
}

/*
 * Given a 'request' (or request-like) module, create an observer attached
 * to a registry that will `POST` snapshots in influxdb format.
 *
 *     import { exportInflux, MetricsRegistry } from "crow-metrics";
 *     import request from "request";
 *
 *     const registry = new MetricsRegistry();
 *     exportInflux(registry, request, "influxdb.prod.example.com", "prod");
 *
 * Options:
 *   - hostname: influxdb host (default: "influxdb.local:8086")
 *   - database: influxdb database name (default: "test")
 *   - url: use a custom url, instead of `http://(hostname)/write?db=(database)`
 *   - timeout: how long to wait before giving up (msec, default 5000)
 *   - log: bunyan-style log for reporting errors
 *   - rank: passed to DeltaObserver
 */
export function exportInflux(registry, request, options = {}) {
  const hostname = options.hostname || "influxdb.local:8086";
  const database = options.database || "test";
  const timeout = options.timeout || 5000;

  const influxObserver = new InfluxObserver(options);
  influxObserver.addObserver(body => {
    if (options.log) options.log.trace("Sending metrics to influxdb...");

    const requestOptions = {
      method: "post",
      url: options.url || `http://${hostname}/write?db=${database}`,
      headers: { "content-type": "text/plain" },
      timeout,
      body
    };

    request(requestOptions, (error, response) => {
      if (error && options.log) options.log.error({ err: error }, "Unable to write metrics to influxdb");
      if (options.log) options.log.trace("Influx returned: " + response.statusCode);
    });
  });

  registry.addObserver(influxObserver.observer);
  return influxObserver;
}
