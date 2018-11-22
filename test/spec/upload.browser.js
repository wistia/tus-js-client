/* global Blob tus SynchronousPromise */

describe("tus", function () {
  describe("#Upload", function () {

    beforeEach(function () {
      jasmine.Ajax.install();
      SynchronousPromise.installGlobally();
      localStorage.clear();
    });

    afterEach(function () {
      jasmine.Ajax.uninstall();
      SynchronousPromise.uninstallGlobally();
    });

    it("should resume an upload from a stored url", function (done) {
      localStorage.setItem("fingerprinted", "http://tus.io/uploads/resuming");

      var file = new Blob("hello world".split(""));
      var options = {
        endpoint: "http://tus.io/uploads",
        onProgress: function () {},
        fingerprint: function () {}
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");

      var upload = new tus.Upload(file, options);
      upload.start();

      expect(options.fingerprint).toHaveBeenCalledWith(file, upload.options);

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/resuming");
      expect(req.method).toBe("HEAD");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Length": 11,
          "Upload-Offset": 3
        }
      });

      expect(upload.url).toBe("http://tus.io/uploads/resuming");

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/resuming");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(3);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.size).toBe(11 - 3);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      done();
    });

    describe("storing of upload urls", function () {
      var options = {
        endpoint: "http://tus.io/uploads",
        fingerprint: function () {}
      };
      var startUpload = function () {
        var file = new Blob("hello world".split(""));
        spyOn(options, "fingerprint").and.returnValue("fingerprinted");

        var upload = new tus.Upload(file, options);
        upload.start();

        expect(options.fingerprint).toHaveBeenCalledWith(file, upload.options);

        var req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/uploads");
        expect(req.method).toBe("POST");

        req.respondWith({
          status: 201,
          responseHeaders: {
            Location: "/uploads/blargh"
          }
        });

        expect(upload.url).toBe("http://tus.io/uploads/blargh");
      };
      var finishUpload = function () {
        var req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/uploads/blargh");
        expect(req.method).toBe("PATCH");

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 11
          }
        });
      };

      it("should store and retain with default options", function (done) {
        startUpload();
        expect(localStorage.getItem("fingerprinted")).toBe("http://tus.io/uploads/blargh");
        finishUpload();
        expect(localStorage.getItem("fingerprinted")).toBe("http://tus.io/uploads/blargh");
        done();
      });

      it("should store and remove with option removeFingerprintOnSuccess set", function (done) {
        options.removeFingerprintOnSuccess = true;
        startUpload();
        expect(localStorage.getItem("fingerprinted")).toBe("http://tus.io/uploads/blargh");
        finishUpload();
        expect(localStorage.getItem("fingerprinted")).toBe(null);
        done();
      });
    });

    it("should delete upload urls on a 4XX", function (done) {
      localStorage.setItem("fingerprinted", "http://tus.io/uploads/resuming");

      var file = new Blob("hello world".split(""));
      var options = {
        endpoint: "http://tus.io/uploads",
        fingerprint: function () {}
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");

      var upload = new tus.Upload(file, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/resuming");
      expect(req.method).toBe("HEAD");

      req.respondWith({
        status: 400
      });

      expect(localStorage.getItem("fingerprinted")).toBe(null);
      done();
    });

    it("should add the request's body to errors", function () {
      var file = new Blob("hello world".split(""));
      var err;
      var options = {
        endpoint: "http://tus.io/uploads",
        onError: function (e) {
          err = e;
        }
      };

      var upload = new tus.Upload(file, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads");
      expect(req.method).toBe("POST");

      req.respondWith({
        status: 500,
        responseText: "server_error"
      });

      expect(err.message).toBe("tus: unexpected response while creating upload, originated from request (response code: 500, response text: server_error)");
      expect(err.originalRequest).toBeDefined();
    });

    describe("resolving of URIs", function () {
      beforeEach(function () {
        window.__tus__forceReactNative = true;
      });

      afterEach(function () {
        window.__tus__forceReactNative = false;
      });

      it("should upload a file from an URI", function (done) {
        localStorage.setItem("fingerprinted", "http://tus.io/uploads/resuming");

        var file = {
          uri: "file:///my/file.dat"
        };
        var options = {
          endpoint: "http://tus.io/uploads",
          onSuccess: function () {}
        };
        spyOn(options, "onSuccess");

        var upload = new tus.Upload(file, options);
        upload.start();

        var req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("file:///my/file.dat");
        expect(req.method).toBe("GET");
        expect(req.responseType).toBe("blob");


        req.respondWith({
          status: 200,
          responseHeaders: {
            "Upload-Length": 11,
            "Upload-Offset": 3
          },
          response: new Blob("hello world".split(""))
        });

        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/uploads");
        expect(req.method).toBe("POST");
        expect(req.requestHeaders["Upload-Length"]).toBe(11);

        req.respondWith({
          status: 201,
          responseHeaders: {
            Location: "/uploads/blargh"
          }
        });

        expect(upload.url).toBe("http://tus.io/uploads/blargh");

        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/uploads/blargh");
        expect(req.method).toBe("PATCH");
        expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
        expect(req.requestHeaders["Upload-Offset"]).toBe(0);
        expect(req.contentType()).toBe("application/offset+octet-stream");
        expect(req.params.size).toBe(11);

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 11
          }
        });

        expect(options.onSuccess).toHaveBeenCalledWith();
        done();
      });

      it("should emit an error if it can't resolve the URI", function (done) {
        localStorage.setItem("fingerprinted", "http://tus.io/uploads/resuming");

        var file = {
          uri: "file:///my/file.dat"
        };
        var options = {
          endpoint: "http://tus.io/uploads",
          onError: function () {}
        };
        spyOn(options, "onError");

        var upload = new tus.Upload(file, options);
        upload.start();

        var req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("file:///my/file.dat");
        expect(req.method).toBe("GET");
        expect(req.responseType).toBe("blob");

        req.responseError();

        expect(options.onError).toHaveBeenCalledWith(new Error("tus: cannot fetch `file.uri` as Blob, make sure the uri is correct and accessible. [object Object]"));
        done();
      });
    });

    it("should upload data from a reader", function (done) {
      var reader = {
        value: "hello world".split(""),
        read: function () {
          if (this.value) {
            const value = this.value;
            this.value = null;
            return Promise.resolve({ value, done: false });
          } else {
            return Promise.resolve({ value: undefined, done: true });
          }
        }
      };

      var options = {
        endpoint: "http://tus.io/uploads",
        headers: {
          Custom: "blargh"
        },
        metadata: {
          foo: "hello",
          bar: "world",
          nonlatin: "słońce",
          number: 100
        },
        withCredentials: true,
        chunkSize: 100,
        onProgress: function () {},
        fingerprint: function () {},
        uploadLengthDeferred: true
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");

      var upload = new tus.Upload(reader, options);
      upload.start();

      expect(options.fingerprint).toHaveBeenCalledWith(reader, upload.options);

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Length"]).toBe(undefined);
      expect(req.requestHeaders["Upload-Defer-Length"]).toBe(1);
      expect(req.withCredentials).toBe(true);
      if ("btoa" in window) {
        expect(req.requestHeaders["Upload-Metadata"]).toBe("foo aGVsbG8=,bar d29ybGQ=,nonlatin c8WCb8WEY2U=,number MTAw");
      }

      req.respondWith({
        status: 201,
        responseHeaders: {
          Location: "http://tus.io/uploads/blargh"
        }
      });

      expect(upload.url).toBe("http://tus.io/uploads/blargh");

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(0);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.length).toBe(11);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, null);

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(11);
      expect(req.requestHeaders["Upload-Length"]).toBe(11);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params).toBe(undefined);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      done();
    });

    it("should upload a reader in chunks", function (done) {
      var reader = {
        value: "hello world".split(""),
        read: function () {
          if (this.value) {
            const value = this.value;
            this.value = null;
            return Promise.resolve({ value, done: false });
          } else {
            return Promise.resolve({ value: undefined, done: true });
          }
        }
      };

      var options = {
        endpoint: "http://tus.io/uploads",
        headers: {
          Custom: "blargh"
        },
        metadata: {
          foo: "hello",
          bar: "world",
          nonlatin: "słońce",
          number: 100
        },
        withCredentials: true,
        chunkSize: 6,
        onProgress: function () {},
        fingerprint: function () {},
        uploadLengthDeferred: true
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");

      var upload = new tus.Upload(reader, options);
      upload.start();

      expect(options.fingerprint).toHaveBeenCalledWith(reader, upload.options);

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Length"]).toBe(undefined);
      expect(req.requestHeaders["Upload-Defer-Length"]).toBe(1);
      expect(req.withCredentials).toBe(true);
      if ("btoa" in window) {
        expect(req.requestHeaders["Upload-Metadata"]).toBe("foo aGVsbG8=,bar d29ybGQ=,nonlatin c8WCb8WEY2U=,number MTAw");
      }

      req.respondWith({
        status: 201,
        responseHeaders: {
          Location: "http://tus.io/uploads/blargh"
        }
      });

      expect(upload.url).toBe("http://tus.io/uploads/blargh");

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(0);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.length).toBe(6);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 6
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(6, null);

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(6);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.length).toBe(5);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, null);

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(11);
      expect(req.requestHeaders["Upload-Length"]).toBe(11);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params).toBe(undefined);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      done();
    });

    it("should fill chunkSize from a reader", function (done) {
      var reader = {
        value: "hello world".split(""),
        read: function () {
          let value, done = false;
          if (this.value.length > 0) {
            value = this.value.slice(0,1);
            this.value = this.value.slice(1);
          } else {
            done = true;
          }
          return Promise.resolve({ value, done });
        }
      };

      var options = {
        endpoint: "http://tus.io/uploads",
        headers: {
          Custom: "blargh"
        },
        metadata: {
          foo: "hello",
          bar: "world",
          nonlatin: "słońce",
          number: 100
        },
        withCredentials: true,
        chunkSize: 6,
        onProgress: function () {},
        fingerprint: function () {},
        uploadLengthDeferred: true
      };
      spyOn(options, "fingerprint").and.returnValue("fingerprinted");
      spyOn(options, "onProgress");

      var upload = new tus.Upload(reader, options);
      upload.start();

      expect(options.fingerprint).toHaveBeenCalledWith(reader, upload.options);

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads");
      expect(req.method).toBe("POST");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Length"]).toBe(undefined);
      expect(req.requestHeaders["Upload-Defer-Length"]).toBe(1);
      expect(req.withCredentials).toBe(true);
      if ("btoa" in window) {
        expect(req.requestHeaders["Upload-Metadata"]).toBe("foo aGVsbG8=,bar d29ybGQ=,nonlatin c8WCb8WEY2U=,number MTAw");
      }

      req.respondWith({
        status: 201,
        responseHeaders: {
          Location: "http://tus.io/uploads/blargh"
        }
      });

      expect(upload.url).toBe("http://tus.io/uploads/blargh");

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(0);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.length).toBe(6);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 6
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(6, null);

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(6);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params.length).toBe(5);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, null);

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/uploads/blargh");
      expect(req.method).toBe("PATCH");
      expect(req.requestHeaders.Custom).toBe("blargh");
      expect(req.requestHeaders["Tus-Resumable"]).toBe("1.0.0");
      expect(req.requestHeaders["Upload-Offset"]).toBe(11);
      expect(req.requestHeaders["Upload-Length"]).toBe(11);
      expect(req.contentType()).toBe("application/offset+octet-stream");
      expect(req.params).toBe(undefined);
      expect(req.withCredentials).toBe(true);

      req.respondWith({
        status: 204,
        responseHeaders: {
          "Upload-Offset": 11
        }
      });

      expect(options.onProgress).toHaveBeenCalledWith(11, 11);
      done();
    });

    it("should retry the upload with a reader", function (done) {
      var reader = {
        value: "hello world".split(""),
        read: function () {
          let value, done = false;
          if (this.value.length > 0) {
            value = this.value.slice(0,1);
            this.value = this.value.slice(1);
          } else {
            done = true;
          }
          return Promise.resolve({ value, done });
        }
      };
      var options = {
        endpoint: "http://tus.io/files/",
        chunkSize: 11,
        retryDelays: [10, 10, 10],
        onSuccess: function () {},
        uploadLengthDeferred: true
      };

      spyOn(options, "onSuccess");


      var upload = new tus.Upload(reader, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/files/");
      expect(req.method).toBe("POST");

      req.respondWith({
        status: 500
      });

      setTimeout(function () {
        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/files/");
        expect(req.method).toBe("POST");

        req.respondWith({
          status: 201,
          responseHeaders: {
            Location: "/files/foo"
          }
        });

        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/files/foo");
        expect(req.method).toBe("PATCH");

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 11
          }
        });

        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/files/foo");
        expect(req.method).toBe("PATCH");
        expect(req.requestHeaders["Upload-Length"]).toBe(11);

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 11
          }
        });

        expect(options.onSuccess).toHaveBeenCalled();
        done();
      }, 20);
    });

    it("should retry failed chunks with a reader", function (done) {
      var reader = {
        value: "hello world".split(""),
        read: function () {
          let value, done = false;
          if (this.value.length > 0) {
            value = this.value.slice(0,1);
            this.value = this.value.slice(1);
          } else {
            done = true;
          }
          return Promise.resolve({ value, done });
        }
      };
      var options = {
        endpoint: "http://tus.io/files/",
        chunkSize: 11,
        retryDelays: [10, 10, 10],
        onSuccess: function () {},
        uploadLengthDeferred: true
      };

      spyOn(options, "onSuccess");


      var upload = new tus.Upload(reader, options);
      upload.start();

      var req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/files/");
      expect(req.method).toBe("POST");

      req.respondWith({
        status: 201,
        responseHeaders: {
          Location: "/files/foo"
        }
      });

      req = jasmine.Ajax.requests.mostRecent();
      expect(req.url).toBe("http://tus.io/files/foo");
      expect(req.method).toBe("PATCH");

      req.respondWith({
        status: 500
      });

      setTimeout(function () {
        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/files/foo");
        expect(req.method).toBe("HEAD");

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 0
          }
        });

        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/files/foo");
        expect(req.method).toBe("PATCH");

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 11
          }
        });

        req = jasmine.Ajax.requests.mostRecent();
        expect(req.url).toBe("http://tus.io/files/foo");
        expect(req.method).toBe("PATCH");
        expect(req.requestHeaders["Upload-Length"]).toBe(11);

        req.respondWith({
          status: 204,
          responseHeaders: {
            "Upload-Offset": 11
          }
        });

        expect(options.onSuccess).toHaveBeenCalled();
        done();
      }, 20);
    });
  });
});
