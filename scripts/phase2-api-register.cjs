const original=global.fetch;global.fetch=(url,...args)=>original(typeof url==='string'?url.replace('127.0.0.1:3000','127.0.0.1:3107'):url,...args);
