function Transition(klass) {
  this.klass = klass;
}

function Property(index) {
  this.index = index;
}

function Klass(kind) {
  // Classes are "fast" if they are C-struct like and "slow" is they are Map-like.
  this.kind = kind;
  this.descriptors = new Map;
  this.keys = [];
}

Klass.prototype = {
  // Create hidden class with a new property that does not exist on
  // the current hidden class.
  addProperty: function (key) {
    var klass = this.clone();
    klass.append(key);
    // Connect hidden classes with transition to enable sharing:
    //           this == add property key ==> klass
    this.descriptors.set(key, new Transition(klass));
    return klass;
  },

  hasProperty: function (key) {
    return this.descriptors.has(key);
  },

  getDescriptor: function (key) {
    return this.descriptors.get(key);
  },

  getIndex: function (key) {
    return this.getDescriptor(key).index;
  },

  // Create clone of this hidden class that has same properties
  // at same offsets (but does not have any transitions).
  clone: function () {
    var klass = new Klass(this.kind);
    klass.keys = this.keys.slice(0);
    for (var i = 0; i < this.keys.length; i++) {
      var key = this.keys[i];
      klass.descriptors.set(key, this.descriptors.get(key));
    }
    return klass;
  },

  // Add real property to descriptors.
  append: function (key) {
    this.keys.push(key);
    this.descriptors.set(key, new Property(this.keys.length - 1));
  }
};

var ROOT_KLASS = new Klass("fast");

function Table() {
  // All tables start from the fast empty root hidden class.
  this.klass = ROOT_KLASS;
  this.properties = [];  // Array of named properties: 'x','y',...
  this.elements = [];  // Array of indexed properties: 0, 1, ...
  // We will actually cheat a little bit and allow any int32 to go here,
  // we will also allow V8 to select appropriate representation for
  // the array's backing store. There are too many details to cover in
  // a single blog post :-)
}

Table.prototype = {
  load: function (key) {
    if (this.klass.kind === "slow") {
      // Slow class => properties are represented as Map.
      return this.properties.get(key);
    }

    // This is fast table with indexed and named properties only.
    if (typeof key === "number" && (key | 0) === key) {  // Indexed property.
      return this.elements[key];
    } else if (typeof key === "string") {  // Named property.
      var idx = this.findPropertyForRead(key);
      return (idx >= 0) ? this.properties[idx] : void 0;
    }

    // There can be only string&number keys on fast table.
    return void 0;
  },

  store: function (key, value) {
    if (this.klass.kind === "slow") {
      // Slow class => properties are represented as Map.
      this.properties.set(key, value);
      return;
    }

    // This is fast table with indexed and named properties only.
    if (typeof key === "number" && (key | 0) === key) {  // Indexed property.
      this.elements[key] = value;
      return;
    } else if (typeof key === "string") {  // Named property.
      var index = this.findPropertyForWrite(key);
      if (index >= 0) {
        this.properties[index] = value;
        return;
      }
    }

    this.convertToSlow();
    this.store(key, value);
  },

  // Find property or add one if possible, returns property index
  // or -1 if we have too many properties and should switch to slow.
  findPropertyForWrite: function (key) {
    if (!this.klass.hasProperty(key)) {  // Try adding property if it does not exist.
      // To many properties! Achtung! Fast case kaput.
      if (this.klass.keys.length > 20) return -1;

      // Switch class to the one that has this property.
      this.klass = this.klass.addProperty(key);
      return this.klass.getIndex(key);
    }

    var desc = this.klass.getDescriptor(key);
    if (desc instanceof Transition) {
      // Property does not exist yet but we have a transition to the class that has it.
      this.klass = desc.klass;
      return this.klass.getIndex(key);
    }

    // Get index of existing property.
    return desc.index;
  },

  // Find property index if property exists, return -1 otherwise.
  findPropertyForRead: function (key) {
    if (!this.klass.hasProperty(key)) return -1;
    var desc = this.klass.getDescriptor(key);
    if (!(desc instanceof Property)) return -1;  // Here we are not interested in transitions.
    return desc.index;
  },

  // Copy all properties into the Map and switch to slow class.
  convertToSlow: function () {
    var map = new Map;
    for (var i = 0; i < this.klass.keys.length; i++) {
      var key = this.klass.keys[i];
      var val = this.properties[i];
      map.set(key, val);
    }

    Object.keys(this.elements).forEach(function (key) {
      var val = this.elements[key];
      map.set(key | 0, val);  // Funky JS, force key back to int32.
    }, this);

    this.properties = map;
    this.elements = null;
    this.klass = new Klass("slow");
  }
};

function CHECK_TABLE(t) {
  if (!(t instanceof Table)) {
    throw new Error("table expected");
  }
}

function LOAD(t, k) {
  CHECK_TABLE(t);
  return t.load(k);
}

function STORE(t, k, v) {
  CHECK_TABLE(t);
  t.store(k, v);
}

var os = new Table();

STORE(os, 'clock', function () {
  return Date.now() / 1000;
});
