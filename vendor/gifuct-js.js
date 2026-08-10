// Vendored copy of gifuct-js@2.1.2 (MIT, https://www.npmjs.com/package/gifuct-js)
// and its only runtime dependency, js-binary-schema-parser@2.0.3 (MIT,
// https://www.npmjs.com/package/js-binary-schema-parser). Source is the
// original unminified CommonJS build from each package, wrapped in a tiny
// require() shim below instead of pulled from a CDN at page-load time.
//
// Why self-hosted: the GIF cropper used to load this from jsdelivr.net on
// demand. Some ad blockers/privacy extensions block that as a third-party
// CDN request - when that happens, cropping a GIF fails, and because the
// original file/link is still sitting untouched in the upload form, it's
// easy to miss the failure message and accidentally upload the un-cropped
// original instead. Serving this from the same origin as everything else
// removes that failure mode.
(function (global) {
    'use strict';

    var modules = {};
    function define(id, factory) {
        modules[id] = { factory: factory, exports: null };
    }
    function resolve(id) {
        var mod = modules[id];
        if (!mod) throw new Error('Unknown vendored gifuct-js module: ' + id);
        if (!mod.exports) {
            mod.exports = {};
            mod.factory(mod.exports, requireShim);
        }
        return mod.exports;
    }
    var ALIASES = {
        'js-binary-schema-parser/lib/schemas/gif': 'jbsp-gif-schema',
        'js-binary-schema-parser': 'jbsp-index',
        'js-binary-schema-parser/lib/parsers/uint8': 'jbsp-uint8',
        './deinterlace': 'deinterlace',
        './lzw': 'lzw',
        '../': 'jbsp-index',
        '../parsers/uint8': 'jbsp-uint8'
    };
    function requireShim(id) { return resolve(ALIASES[id] || id); }

    // ---- js-binary-schema-parser/lib/index.js ----
    define('jbsp-index', function (exports) {
        "use strict";

        Object.defineProperty(exports, "__esModule", { value: true });
        exports.loop = exports.conditional = exports.parse = void 0;

        var parse = function parse(stream, schema) {
            var result = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
            var parent = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : result;

            if (Array.isArray(schema)) {
                schema.forEach(function (partSchema) {
                    return parse(stream, partSchema, result, parent);
                });
            } else if (typeof schema === 'function') {
                schema(stream, result, parent, parse);
            } else {
                var key = Object.keys(schema)[0];

                if (Array.isArray(schema[key])) {
                    parent[key] = {};
                    parse(stream, schema[key], result, parent[key]);
                } else {
                    parent[key] = schema[key](stream, result, parent, parse);
                }
            }

            return result;
        };

        exports.parse = parse;

        var conditional = function conditional(schema, conditionFunc) {
            return function (stream, result, parent, parse) {
                if (conditionFunc(stream, result, parent)) {
                    parse(stream, schema, result, parent);
                }
            };
        };

        exports.conditional = conditional;

        var loop = function loop(schema, continueFunc) {
            return function (stream, result, parent, parse) {
                var arr = [];
                var lastStreamPos = stream.pos;

                while (continueFunc(stream, result, parent)) {
                    var newParent = {};
                    parse(stream, schema, result, newParent);

                    if (stream.pos === lastStreamPos) {
                        break;
                    }

                    lastStreamPos = stream.pos;
                    arr.push(newParent);
                }

                return arr;
            };
        };

        exports.loop = loop;
    });

    // ---- js-binary-schema-parser/lib/parsers/uint8.js ----
    define('jbsp-uint8', function (exports) {
        "use strict";

        Object.defineProperty(exports, "__esModule", { value: true });
        exports.readBits = exports.readArray = exports.readUnsigned = exports.readString = exports.peekBytes = exports.readBytes = exports.peekByte = exports.readByte = exports.buildStream = void 0;

        var buildStream = function buildStream(uint8Data) {
            return { data: uint8Data, pos: 0 };
        };

        exports.buildStream = buildStream;

        var readByte = function readByte() {
            return function (stream) {
                return stream.data[stream.pos++];
            };
        };

        exports.readByte = readByte;

        var peekByte = function peekByte() {
            var offset = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
            return function (stream) {
                return stream.data[stream.pos + offset];
            };
        };

        exports.peekByte = peekByte;

        var readBytes = function readBytes(length) {
            return function (stream) {
                return stream.data.subarray(stream.pos, stream.pos += length);
            };
        };

        exports.readBytes = readBytes;

        var peekBytes = function peekBytes(length) {
            return function (stream) {
                return stream.data.subarray(stream.pos, stream.pos + length);
            };
        };

        exports.peekBytes = peekBytes;

        var readString = function readString(length) {
            return function (stream) {
                return Array.from(readBytes(length)(stream)).map(function (value) {
                    return String.fromCharCode(value);
                }).join('');
            };
        };

        exports.readString = readString;

        var readUnsigned = function readUnsigned(littleEndian) {
            return function (stream) {
                var bytes = readBytes(2)(stream);
                return littleEndian ? (bytes[1] << 8) + bytes[0] : (bytes[0] << 8) + bytes[1];
            };
        };

        exports.readUnsigned = readUnsigned;

        var readArray = function readArray(byteSize, totalOrFunc) {
            return function (stream, result, parent) {
                var total = typeof totalOrFunc === 'function' ? totalOrFunc(stream, result, parent) : totalOrFunc;
                var parser = readBytes(byteSize);
                var arr = new Array(total);

                for (var i = 0; i < total; i++) {
                    arr[i] = parser(stream);
                }

                return arr;
            };
        };

        exports.readArray = readArray;

        var subBitsTotal = function subBitsTotal(bits, startIndex, length) {
            var result = 0;

            for (var i = 0; i < length; i++) {
                result += bits[startIndex + i] && Math.pow(2, length - i - 1);
            }

            return result;
        };

        var readBits = function readBits(schema) {
            return function (stream) {
                var _byte = readByte()(stream);

                var bits = new Array(8);

                for (var i = 0; i < 8; i++) {
                    bits[7 - i] = !!(_byte & 1 << i);
                }

                return Object.keys(schema).reduce(function (res, key) {
                    var def = schema[key];

                    if (def.length) {
                        res[key] = subBitsTotal(bits, def.index, def.length);
                    } else {
                        res[key] = bits[def.index];
                    }

                    return res;
                }, {});
            };
        };

        exports.readBits = readBits;
    });

    // ---- js-binary-schema-parser/lib/schemas/gif.js ----
    define('jbsp-gif-schema', function (exports, require) {
        "use strict";

        Object.defineProperty(exports, "__esModule", { value: true });
        exports["default"] = void 0;

        var _ = require("../");

        var _uint = require("../parsers/uint8");

        var subBlocksSchema = {
            blocks: function blocks(stream) {
                var terminator = 0x00;
                var chunks = [];
                var streamSize = stream.data.length;
                var total = 0;

                for (var size = (0, _uint.readByte)()(stream); size !== terminator; size = (0, _uint.readByte)()(stream)) {
                    if (!size) break;

                    if (stream.pos + size >= streamSize) {
                        var availableSize = streamSize - stream.pos;
                        chunks.push((0, _uint.readBytes)(availableSize)(stream));
                        total += availableSize;
                        break;
                    }

                    chunks.push((0, _uint.readBytes)(size)(stream));
                    total += size;
                }

                var result = new Uint8Array(total);
                var offset = 0;

                for (var i = 0; i < chunks.length; i++) {
                    result.set(chunks[i], offset);
                    offset += chunks[i].length;
                }

                return result;
            }
        };

        var gceSchema = (0, _.conditional)({
            gce: [{
                codes: (0, _uint.readBytes)(2)
            }, {
                byteSize: (0, _uint.readByte)()
            }, {
                extras: (0, _uint.readBits)({
                    future: { index: 0, length: 3 },
                    disposal: { index: 3, length: 3 },
                    userInput: { index: 6 },
                    transparentColorGiven: { index: 7 }
                })
            }, {
                delay: (0, _uint.readUnsigned)(true)
            }, {
                transparentColorIndex: (0, _uint.readByte)()
            }, {
                terminator: (0, _uint.readByte)()
            }]
        }, function (stream) {
            var codes = (0, _uint.peekBytes)(2)(stream);
            return codes[0] === 0x21 && codes[1] === 0xf9;
        });

        var imageSchema = (0, _.conditional)({
            image: [{
                code: (0, _uint.readByte)()
            }, {
                descriptor: [{
                    left: (0, _uint.readUnsigned)(true)
                }, {
                    top: (0, _uint.readUnsigned)(true)
                }, {
                    width: (0, _uint.readUnsigned)(true)
                }, {
                    height: (0, _uint.readUnsigned)(true)
                }, {
                    lct: (0, _uint.readBits)({
                        exists: { index: 0 },
                        interlaced: { index: 1 },
                        sort: { index: 2 },
                        future: { index: 3, length: 2 },
                        size: { index: 5, length: 3 }
                    })
                }]
            }, (0, _.conditional)({
                lct: (0, _uint.readArray)(3, function (stream, result, parent) {
                    return Math.pow(2, parent.descriptor.lct.size + 1);
                })
            }, function (stream, result, parent) {
                return parent.descriptor.lct.exists;
            }), {
                data: [{
                    minCodeSize: (0, _uint.readByte)()
                }, subBlocksSchema]
            }]
        }, function (stream) {
            return (0, _uint.peekByte)()(stream) === 0x2c;
        });

        var textSchema = (0, _.conditional)({
            text: [{
                codes: (0, _uint.readBytes)(2)
            }, {
                blockSize: (0, _uint.readByte)()
            }, {
                preData: function preData(stream, result, parent) {
                    return (0, _uint.readBytes)(parent.text.blockSize)(stream);
                }
            }, subBlocksSchema]
        }, function (stream) {
            var codes = (0, _uint.peekBytes)(2)(stream);
            return codes[0] === 0x21 && codes[1] === 0x01;
        });

        var applicationSchema = (0, _.conditional)({
            application: [{
                codes: (0, _uint.readBytes)(2)
            }, {
                blockSize: (0, _uint.readByte)()
            }, {
                id: function id(stream, result, parent) {
                    return (0, _uint.readString)(parent.blockSize)(stream);
                }
            }, subBlocksSchema]
        }, function (stream) {
            var codes = (0, _uint.peekBytes)(2)(stream);
            return codes[0] === 0x21 && codes[1] === 0xff;
        });

        var commentSchema = (0, _.conditional)({
            comment: [{
                codes: (0, _uint.readBytes)(2)
            }, subBlocksSchema]
        }, function (stream) {
            var codes = (0, _uint.peekBytes)(2)(stream);
            return codes[0] === 0x21 && codes[1] === 0xfe;
        });

        var schema = [{
            header: [{
                signature: (0, _uint.readString)(3)
            }, {
                version: (0, _uint.readString)(3)
            }]
        }, {
            lsd: [{
                width: (0, _uint.readUnsigned)(true)
            }, {
                height: (0, _uint.readUnsigned)(true)
            }, {
                gct: (0, _uint.readBits)({
                    exists: { index: 0 },
                    resolution: { index: 1, length: 3 },
                    sort: { index: 4 },
                    size: { index: 5, length: 3 }
                })
            }, {
                backgroundColorIndex: (0, _uint.readByte)()
            }, {
                pixelAspectRatio: (0, _uint.readByte)()
            }]
        }, (0, _.conditional)({
            gct: (0, _uint.readArray)(3, function (stream, result) {
                return Math.pow(2, result.lsd.gct.size + 1);
            })
        }, function (stream, result) {
            return result.lsd.gct.exists;
        }), {
            frames: (0, _.loop)([gceSchema, applicationSchema, commentSchema, imageSchema, textSchema], function (stream) {
                var nextCode = (0, _uint.peekByte)()(stream);
                return nextCode === 0x21 || nextCode === 0x2c;
            })
        }];
        var _default = schema;
        exports["default"] = _default;
    });

    // ---- gifuct-js/lib/deinterlace.js ----
    define('deinterlace', function (exports) {
        "use strict";

        Object.defineProperty(exports, "__esModule", { value: true });
        exports.deinterlace = void 0;

        var deinterlace = function deinterlace(pixels, width) {
            var newPixels = new Array(pixels.length);
            var rows = pixels.length / width;

            var cpRow = function cpRow(toRow, fromRow) {
                var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
                newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
            };

            var offsets = [0, 4, 2, 1];
            var steps = [8, 8, 4, 2];
            var fromRow = 0;

            for (var pass = 0; pass < 4; pass++) {
                for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
                    cpRow(toRow, fromRow);
                    fromRow++;
                }
            }

            return newPixels;
        };

        exports.deinterlace = deinterlace;
    });

    // ---- gifuct-js/lib/lzw.js ----
    define('lzw', function (exports) {
        "use strict";

        Object.defineProperty(exports, "__esModule", { value: true });
        exports.lzw = void 0;

        var lzw = function lzw(minCodeSize, data, pixelCount) {
            var MAX_STACK_SIZE = 4096;
            var nullCode = -1;
            var npix = pixelCount;
            var available, clear, code_mask, code_size, end_of_information, in_code, old_code, bits, code, i, datum, data_size, first, top, bi, pi;
            var dstPixels = new Array(pixelCount);
            var prefix = new Array(MAX_STACK_SIZE);
            var suffix = new Array(MAX_STACK_SIZE);
            var pixelStack = new Array(MAX_STACK_SIZE + 1);

            data_size = minCodeSize;
            clear = 1 << data_size;
            end_of_information = clear + 1;
            available = clear + 2;
            old_code = nullCode;
            code_size = data_size + 1;
            code_mask = (1 << code_size) - 1;

            for (code = 0; code < clear; code++) {
                prefix[code] = 0;
                suffix[code] = code;
            }

            var datum, bits, count, first, top, pi, bi;
            datum = bits = count = first = top = pi = bi = 0;

            for (i = 0; i < npix;) {
                if (top === 0) {
                    if (bits < code_size) {
                        datum += data[bi] << bits;
                        bits += 8;
                        bi++;
                        continue;
                    }

                    code = datum & code_mask;
                    datum >>= code_size;
                    bits -= code_size;

                    if (code > available || code == end_of_information) {
                        break;
                    }

                    if (code == clear) {
                        code_size = data_size + 1;
                        code_mask = (1 << code_size) - 1;
                        available = clear + 2;
                        old_code = nullCode;
                        continue;
                    }

                    if (old_code == nullCode) {
                        pixelStack[top++] = suffix[code];
                        old_code = code;
                        first = code;
                        continue;
                    }

                    in_code = code;

                    if (code == available) {
                        pixelStack[top++] = first;
                        code = old_code;
                    }

                    while (code > clear) {
                        pixelStack[top++] = suffix[code];
                        code = prefix[code];
                    }

                    first = suffix[code] & 0xff;
                    pixelStack[top++] = first;

                    if (available < MAX_STACK_SIZE) {
                        prefix[available] = old_code;
                        suffix[available] = first;
                        available++;

                        if ((available & code_mask) === 0 && available < MAX_STACK_SIZE) {
                            code_size++;
                            code_mask += available;
                        }
                    }

                    old_code = in_code;
                }

                top--;
                dstPixels[pi++] = pixelStack[top];
                i++;
            }

            for (i = pi; i < npix; i++) {
                dstPixels[i] = 0;
            }

            return dstPixels;
        };

        exports.lzw = lzw;
    });

    // ---- gifuct-js/lib/index.js ----
    define('gifuct-index', function (exports, require) {
        "use strict";

        Object.defineProperty(exports, "__esModule", { value: true });
        exports.decompressFrames = exports.decompressFrame = exports.parseGIF = void 0;

        function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

        var _gif = _interopRequireDefault(require("js-binary-schema-parser/lib/schemas/gif"));

        var _jsBinarySchemaParser = require("js-binary-schema-parser");

        var _uint = require("js-binary-schema-parser/lib/parsers/uint8");

        var _deinterlace = require("./deinterlace");

        var _lzw = require("./lzw");

        var parseGIF = function parseGIF(arrayBuffer) {
            var byteData = new Uint8Array(arrayBuffer);
            return (0, _jsBinarySchemaParser.parse)((0, _uint.buildStream)(byteData), _gif["default"]);
        };

        exports.parseGIF = parseGIF;

        var generatePatch = function generatePatch(image) {
            var totalPixels = image.pixels.length;
            var patchData = new Uint8ClampedArray(totalPixels * 4);

            for (var i = 0; i < totalPixels; i++) {
                var pos = i * 4;
                var colorIndex = image.pixels[i];
                var color = image.colorTable[colorIndex] || [0, 0, 0];
                patchData[pos] = color[0];
                patchData[pos + 1] = color[1];
                patchData[pos + 2] = color[2];
                patchData[pos + 3] = colorIndex !== image.transparentIndex ? 255 : 0;
            }

            return patchData;
        };

        var decompressFrame = function decompressFrame(frame, gct, buildImagePatch) {
            if (!frame.image) {
                console.warn('gif frame does not have associated image.');
                return;
            }

            var image = frame.image;
            var totalPixels = image.descriptor.width * image.descriptor.height;
            var pixels = (0, _lzw.lzw)(image.data.minCodeSize, image.data.blocks, totalPixels);

            if (image.descriptor.lct.interlaced) {
                pixels = (0, _deinterlace.deinterlace)(pixels, image.descriptor.width);
            }

            var resultImage = {
                pixels: pixels,
                dims: {
                    top: frame.image.descriptor.top,
                    left: frame.image.descriptor.left,
                    width: frame.image.descriptor.width,
                    height: frame.image.descriptor.height
                }
            };

            if (image.descriptor.lct && image.descriptor.lct.exists) {
                resultImage.colorTable = image.lct;
            } else {
                resultImage.colorTable = gct;
            }

            if (frame.gce) {
                resultImage.delay = (frame.gce.delay || 10) * 10;
                resultImage.disposalType = frame.gce.extras.disposal;

                if (frame.gce.extras.transparentColorGiven) {
                    resultImage.transparentIndex = frame.gce.transparentColorIndex;
                }
            }

            if (buildImagePatch) {
                resultImage.patch = generatePatch(resultImage);
            }

            return resultImage;
        };

        exports.decompressFrame = decompressFrame;

        var decompressFrames = function decompressFrames(parsedGif, buildImagePatches) {
            return parsedGif.frames.filter(function (f) {
                return f.image;
            }).map(function (f) {
                return decompressFrame(f, parsedGif.gct, buildImagePatches);
            });
        };

        exports.decompressFrames = decompressFrames;
    });

    global.gifuctJs = resolve('gifuct-index');
})(window);
