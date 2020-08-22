'use strict';

const assert = require('assert');
const libUtil = require('util');

/**
 * Convert hash keys to values and vice versa
 * @param hash
 */
function reverseHash(hash) {
  const result = {};
  for (const key in hash) {
    if (hash.hasOwnProperty(key)) {
      result[hash[key]] = key;
    }
  }
  return result;
}

function isFunction(val) {
  return val && Object.prototype.toString.call(val) === '[object Function]';
}

function isObject(val) {
  return val != null && typeof val === 'object';
}

const INSPECT_COMPACT_OPTIONS = {
  id_properties: ['id', 'name', 'title', 'key', 'index'],
  inspect_options: { depth: 1 },
  string_cutoff: 250,
  array_cutoff: 500,
};

/**
 * Inspect any value and turn it into string suitable for logging
 */
function inspectCompact(arg, options = INSPECT_COMPACT_OPTIONS) {
  if (arg instanceof Error) {
    return `{${String(arg)}}`;
  }

  if (arg instanceof RegExp) {
    return arg.toString();
  }

  if (arg instanceof Date) {
    return arg.toISOString();
  }

  if (Array.isArray(arg)) {
    const members = [];
    let totalLength = 0;
    let i;
    for (i = 0; i < arg.length; i++) {
      const member = inspectCompact(arg[i], options);
      if (totalLength + member.length > options.array_cutoff) {
        break;
      }
      totalLength += member.length;
      members.push(member);
    }

    const suffix = i < arg.length - 1 ? `... (${arg.length - i + 1} more)` : '';

    return `[${members.join(', ')}${suffix}]`;
  }

  if (isObject(arg)) {
    const props = [];

    options.id_properties.forEach(idProp => {
      if (arg[idProp]) {
        props.push(`${idProp}=${String(arg[idProp])}`);
      }
    });

    let name = (arg.constructor && arg.constructor.name) || 'Bag';
    if (name === 'Object') {
      name = 'Hash';
    }

    if (props.length) {
      return '{' + name + ': ' + props.join(' ') + '}';
    }
    return '{' + name + '}';
  }

  if (typeof arg === 'string' && arg.length >= options.string_cutoff) {
    arg = arg.slice(0, options.string_cutoff - 3) + '...';
  }

  return libUtil.inspect(arg, options.inspect_options);
}

function assertSubset(hashToCheck, canonicalHash) {
  for (const key in canonicalHash) {
    if (canonicalHash.hasOwnProperty(key)) {
      assert.ok(key in hashToCheck, 'All required keys must have values');
    }
  }
}

module.exports = {
  reverseHash,
  inspectCompact,
  isFunction,
  assertSubset,
};
