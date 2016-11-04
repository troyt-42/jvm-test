// Initially all ICs are in uninitialized state.
// They are not hitting the cache and always missing into runtime system.
var STORE$0 = NAMED_STORE_MISS;
var STORE$1 = NAMED_STORE_MISS;
var KEYED_STORE$2 = KEYED_STORE_MISS;
var STORE$3 = NAMED_STORE_MISS;
var LOAD$4 = NAMED_LOAD_MISS;
var STORE$5 = NAMED_STORE_MISS;
var LOAD$6 = NAMED_LOAD_MISS;
var LOAD$7 = NAMED_LOAD_MISS;
var KEYED_LOAD$8 = KEYED_LOAD_MISS;
var STORE$9 = NAMED_STORE_MISS;
var LOAD$10 = NAMED_LOAD_MISS;
var LOAD$11 = NAMED_LOAD_MISS;
var KEYED_LOAD$12 = KEYED_LOAD_MISS;
var LOAD$13 = NAMED_LOAD_MISS;
var LOAD$14 = NAMED_LOAD_MISS;

function MakePoint(x, y) {
  var point = new Table();
  STORE$0(point, 'x', x, 0);  // The last number is IC's id: STORE$0 &rArr; id is 0
  STORE$1(point, 'y', y, 1);
  return point;
}

function MakeArrayOfPoints(N) {
  var array = new Table();
  var m = -1;
  for (var i = 0; i <= N; i++) {
    m = m * -1;
    // Now we are also distinguishing between expressions x[p] and x.p.
    // The fist one is called keyed load/store and the second one is called
    // named load/store.
    // The main difference is that named load/stores use a fixed known
    // constant string key and thus can be specialized for a fixed property
    // offset.
    KEYED_STORE$2(array, i, MakePoint(m * i, m * -i), 2);
  }
  STORE$3(array, 'n', N, 3);
  return array;
}

function SumArrayOfPoints(array) {
  var sum = MakePoint(0, 0);
  for (var i = 0; i <= LOAD$4(array, 'n', 4); i++) {
    STORE$5(sum, 'x', LOAD$6(sum, 'x', 6) + LOAD$7(KEYED_LOAD$8(array, i, 8), 'x', 7), 5);
    STORE$9(sum, 'y', LOAD$10(sum, 'y', 10) + LOAD$11(KEYED_LOAD$12(array, i, 12), 'y', 11), 9);
  }
  return sum;
}

function CheckResults(sum) {
  var x = LOAD$13(sum, 'x', 13);
  var y = LOAD$14(sum, 'y', 14);
  if (x !== 50000 || y !== -50000) throw new Error("failed x: " + x + ", y:" + y);
}

function NAMED_LOAD_MISS(t, k, ic) {
  var v = LOAD(t, k);
  if (t.klass.kind === "fast") {
    // Create a load stub that is specialized for a fixed class and key k and
    // loads property from a fixed offset.
    var stub = CompileNamedLoadFastProperty(t.klass, k);
    PatchIC("LOAD", ic, stub);
  }
  return v;
}

function NAMED_STORE_MISS(t, k, v, ic) {
  var klass_before = t.klass;
  STORE(t, k, v);
  var klass_after = t.klass;
  if (klass_before.kind === "fast" &&
      klass_after.kind === "fast") {
    // Create a store stub that is specialized for a fixed transition between classes
    // and a fixed key k that stores property into a fixed offset and replaces
    // object's hidden class if necessary.
    var stub = CompileNamedStoreFastProperty(klass_before, klass_after, k);
    PatchIC("STORE", ic, stub);
  }
}

function KEYED_LOAD_MISS(t, k, ic) {
  var v = LOAD(t, k);
  if (t.klass.kind === "fast" && (typeof k === 'number' && (k | 0) === k)) {
    // Create a stub for the fast load from the elements array.
    // Does not actually depend on the class but could if we had more complicated
    // storage system.
    var stub = CompileKeyedLoadFastElement();
    PatchIC("KEYED_LOAD", ic, stub);
  }
  return v;
}

function KEYED_STORE_MISS(t, k, v, ic) {
  STORE(t, k, v);
  if (t.klass.kind === "fast" && (typeof k === 'number' && (k | 0) === k)) {
    // Create a stub for the fast store into the elements array.
    // Does not actually depend on the class but could if we had more complicated
    // storage system.
    var stub = CompileKeyedStoreFastElement();
    PatchIC("KEYED_STORE", ic, stub);
  }
}

function PatchIC(kind, id, stub) {
  this[kind + "$" + id] = stub;  // non-strict JS funkiness: this is global object.
}

function CompileNamedLoadFastProperty(klass, key) {
  // Key is known to be constant (named load). Specialize index.
  var index = klass.getIndex(key);

  function KeyedLoadFastProperty(t, k, ic) {
    if (t.klass !== klass) {
      // Expected klass does not match. Can't use cached index.
      // Fall through to the runtime system.
      return NAMED_LOAD_MISS(t, k, ic);
    }
    return t.properties[index];  // Veni. Vidi. Vici.
  }

  return KeyedLoadFastProperty;
}

function CompileNamedStoreFastProperty(klass_before, klass_after, key) {
  // Key is known to be constant (named load). Specialize index.
  var index = klass_after.getIndex(key);

  if (klass_before !== klass_after) {
    // Transition happens during the store.
    // Compile stub that updates hidden class.
    return function (t, k, v, ic) {
      if (t.klass !== klass_before) {
        // Expected klass does not match. Can't use cached index.
        // Fall through to the runtime system.
        return NAMED_STORE_MISS(t, k, v, ic);
      }
      t.properties[index] = v;  // Fast store.
      t.klass = klass_after;  // T-t-t-transition!
    }
  } else {
    // Write to an existing property. No transition.
    return function (t, k, v, ic) {
      if (t.klass !== klass_before) {
        // Expected klass does not match. Can't use cached index.
        // Fall through to the runtime system.
        return NAMED_STORE_MISS(t, k, v, ic);
      }
      t.properties[index] = v;  // Fast store.
    }
  }
}


function CompileKeyedLoadFastElement() {
  function KeyedLoadFastElement(t, k, ic) {
    if (t.klass.kind !== "fast" || !(typeof k === 'number' && (k | 0) === k)) {
      // If table is slow or key is not a number we can't use fast-path.
      // Fall through to the runtime system, it can handle everything.
      return KEYED_LOAD_MISS(t, k, ic);
    }
    return t.elements[k];
  }

  return KeyedLoadFastElement;
}

function CompileKeyedStoreFastElement() {
  function KeyedStoreFastElement(t, k, v, ic) {
    if (t.klass.kind !== "fast" || !(typeof k === 'number' && (k | 0) === k)) {
      // If table is slow or key is not a number we can't use fast-path.
      // Fall through to the runtime system, it can handle everything.
      return KEYED_STORE_MISS(t, k, v, ic);
    }
    t.elements[k] = v;
  }

  return KeyedStoreFastElement;
}

var N = 100000;
var array = MakeArrayOfPoints(N);
var start = LOAD(os, 'clock')() * 1000;
for (var i = 0; i <= 5; i++) {
  var sum = SumArrayOfPoints(array);
  CheckResults(sum);
}
var end = LOAD(os, 'clock')() * 1000;
print(end - start);
