function getHigherVersion(v1, v2) {
  var parsedV1 = v1.split('.').map(function(str) {
    return parseInt(str);
  });
  var parsedV2 = v2.split('.').map(function(str) {
    return parseInt(str);
  });

  if (parsedV1[0] > parsedV2[0]) {
    return v1;
  } else if (parsedV2[0] > parsedV1[0]) {
    return v2;
  } else {
    if (parsedV1[1] > parsedV2[1]) {
      return v1;
    } else if (parsedV2[1] > parsedV1[1]) {
      return v2;
    } else {
      if (parsedV1[2] > parsedV2[2]) {
        return v1;
      } else if (parsedV2[2] > parsedV1[2]) {
        return v2;
      } else {
        // They were completely identical. Return v1!
        return v1;
      }
    }
  }
}

module.exports = {
  getHigherVersion: getHigherVersion,
};
