/** Jest mock for expo-image-picker. */

import React from "react";
import { View, Text } from "react-native";

const ImagePicker = {
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: [],
  }),
  MediaTypeOptions: {
    Images: "images",
    Videos: "videos",
    All: "all",
  },
  ImagePickerResult: {} as any,
};

export default ImagePicker;