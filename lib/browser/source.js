import isReactNative from "./isReactNative";
import uriToBlob from "./uriToBlob";

class FileSource {
  constructor(file) {
    this._file = file;
    this.size = file.size;
  }

  slice(start, end) {
    return this._file.slice(start, end);
  }

  close() {}
}

class StreamSource {
  constructor(reader, chunkSize) {
    // Ensure that chunkSize is an integer and not something else or Infinity.
    chunkSize = +chunkSize;
    if (!isFinite(chunkSize)) {
      throw new Error("cannot create source for stream without a finite value for the `chunkSize` option");
    }
    this._chunkSize = chunkSize;

    this._buffer = undefined;
    this._bufferOffset = 0;
    this._reader = reader;
    this._done = false;
  }

  slice(start, end) {
    if (start < this._bufferOffset) {
      throw new Error("requested data is before the reader's current offset");
    }

    return this._readUntilEnoughDataOrDone(start, end);
  }

  _readUntilEnoughDataOrDone(start, end) {
    const hasEnoughData = end <= this._bufferOffset + len(this._buffer);
    if (this._done || hasEnoughData) {
      return this._getDataFromBuffer(start, end);
    }
    return this._reader.read().then(({ value, done }) => {
      if (done) {
        this._done = true;
      } else if (this._buffer === undefined){
        this._buffer = value;
      } else {
        this._buffer = concat(this._buffer, value);
      }

      return this._readUntilEnoughDataOrDone(start, end);
    });
  }

  _getDataFromBuffer(start, end) {
    const hasAllDataBeenRead = start >= this._bufferOffset + len(this._buffer);
    if (this._done && hasAllDataBeenRead) {
      return null;
    }
    const bufferToReturn = this._buffer.slice(
      start - this._bufferOffset,
      end - this._bufferOffset
    );
    const chunkSize = end - start;
    if (len(this._buffer) >= 2 * chunkSize) {
      this._buffer = this._buffer.slice(chunkSize);
      this._bufferOffset += chunkSize;
    }
    return bufferToReturn;
  }

  close() {}
}

function len(blobOrArray) {
  if (blobOrArray === undefined) return 0;
  if (blobOrArray.size !== undefined) return blobOrArray.size;
  return blobOrArray.length;
}

/*
  Typed arrays and blobs don't have a concat method.
  This function helps StreamSource accumulate data to reach chunkSize.
*/
function concat(a, b) {
  if (a.concat) {
    return a.concat(b);
  }
  if (a instanceof Blob) {
    return new Blob([a,b], {type: a.type});
  }
  if (a.set) {
    var c = new a.constructor(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
  }
  throw new Error("Unknown data type");
}

export function getSource(input, chunkSize, callback) {
  // In React Native, when user selects a file, instead of a File or Blob, 
  // you usually get a file object {} with a uri property that contains
  // a local path to the file. We use XMLHttpRequest to fetch 
  // the file blob, before uploading with tus.
  // TODO: The __tus__forceReactNative property is currently used to force
  // a React Native environment during testing. This should be removed
  // once we move away from PhantomJS and can overwrite navigator.product
  // properly.
  if ((isReactNative || window.__tus__forceReactNative) && input && typeof input.uri !== "undefined") {
    uriToBlob(input.uri, (err, blob) => {
      if (err) {
        return callback(new Error("tus: cannot fetch `file.uri` as Blob, make sure the uri is correct and accessible. " + err));
      }
      callback(null, new FileSource(blob));
    });
    return;
  }

  // Since we emulate the Blob type in our tests (not all target browsers
  // support it), we cannot use `instanceof` for testing whether the input value
  // can be handled. Instead, we simply check is the slice() function and the
  // size property are available.
  if (typeof input.slice === "function" && typeof input.size !== "undefined") {
    callback(null, new FileSource(input));
    return;
  }

  if (typeof input.read === "function") {
    callback(new StreamSource(input, chunkSize));
    return;
  }

  callback(new Error("source object may only be an instance of File or Blob in this environment"));
}
