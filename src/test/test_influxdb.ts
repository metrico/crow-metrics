import { BunyanLike, exportInfluxDb, Metrics } from "../";

import "should";
import "source-map-support/register";


describe("exportInfluxDb", () => {
  let m: Metrics;

  const saved: Array<{ postUrl: string, text: string }> = [];
  const httpPost = (postUrl: string, text: string, timeout: number, log?: BunyanLike) => {
    saved.push({ postUrl, text });
    return Promise.resolve();
  };

  beforeEach(() => {
    m = Metrics.create();
    saved.splice(0, saved.length);
  });

  afterEach(() => {
    m.registry.stop();
  });


  it("reports empty metrics", async () => {
    m.events.attach(exportInfluxDb({
      hostname: "influxdb.dev.example.com:8086",
      database: "wut",
      timeout: 500,
      httpPost,
    }));
    m.registry.publish();
    saved.length.should.eql(1);
    saved[0].should.eql({
      postUrl: "http://influxdb.dev.example.com:8086/write?db=wut",
      text: `# generated by crow ${m.registry.version}\n`,
    });
  });

  it("reports actual metrics", () => {
    m.events.attach(exportInfluxDb({ httpPost }));
    m.increment(m.counter("tickets"), 5);
    m.setGauge(m.gauge("speed", { vessel: "sailboat" }), 100);
    m.addDistribution(m.distribution("bugs"), 20);
    m.registry.publish();

    saved.length.should.eql(1);
    const timestamp = saved[0].text.split("\n")[1].split(" ")[2];
    (Date.now() - (parseInt(timestamp, 10) / 1000000)).should.be.lessThan(1000);
    saved[0].text.split("\n").slice(1).should.eql([
      `tickets value=5 ${timestamp}`,
      `speed,vessel=sailboat value=100 ${timestamp}`,
      `bugs,p=0.5 value=20 ${timestamp}`,
      `bugs,p=0.9 value=20 ${timestamp}`,
      `bugs,p=0.99 value=20 ${timestamp}`,
      `bugs,p=count value=1 ${timestamp}`,
      `bugs,p=sum value=20 ${timestamp}`,
      ``
    ]);
  });

  it("uses optional field name", () => {
    m.events.attach(exportInfluxDb({ httpPost, fieldName: "v" }));
    m.increment(m.counter("tickets"), 5);
    m.increment(m.counter("tickets", {}, "count"), 7);
    m.setGauge(m.gauge("speed", { vessel: "sailboat" }), 100);
    m.setGauge(m.gauge("speed", { vessel: "sailboat" }, "count"), 200);
    m.addDistribution(m.distribution("bugs"), 20);
    m.addDistribution(m.distribution("bugs", {}, [ 0.5 ], 0.01, "swarm"), 25);
    m.registry.publish();

    saved.length.should.eql(1);
    const timestamp = saved[0].text.split("\n")[1].split(" ")[2];
    (Date.now() - (parseInt(timestamp, 10) / 1000000)).should.be.lessThan(1000);
    saved[0].text.split("\n").slice(1).should.eql([
      `tickets v=5 ${timestamp}`,
      `tickets count=7 ${timestamp}`,
      `speed,vessel=sailboat v=100 ${timestamp}`,
      `speed,vessel=sailboat count=200 ${timestamp}`,
      `bugs,p=0.5 v=20 ${timestamp}`,
      `bugs,p=0.9 v=20 ${timestamp}`,
      `bugs,p=0.99 v=20 ${timestamp}`,
      `bugs,p=count v=1 ${timestamp}`,
      `bugs,p=sum v=20 ${timestamp}`,
      `bugs,p=0.5 swarm=25 ${timestamp}`,
      `bugs,p=count swarm=1 ${timestamp}`,
      `bugs,p=sum swarm=25 ${timestamp}`,
      ``
    ]);
  });
});
