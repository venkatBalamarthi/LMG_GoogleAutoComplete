import Axios from 'axios';
import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import Qs from 'qs';
import React, { Component } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  PixelRatio,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native';
import { compose } from 'redux';

const WINDOW = Dimensions.get('window');

const defaultStyles = {
  container: {
    flex: 1,
  },
  textInputContainer: {
    backgroundColor: '#C9C9CE',
    height: 44,
    borderTopColor: '#7e7e7e',
    borderBottomColor: '#b5b5b5',
    borderTopWidth: 1 / PixelRatio.get(),
    borderBottomWidth: 1 / PixelRatio.get(),
    flexDirection: 'row',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    height: 28,
    borderRadius: 5,
    paddingTop: 4.5,
    paddingBottom: 4.5,
    paddingLeft: 10,
    paddingRight: 10,
    marginTop: 7.5,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 15,
    flex: 1,
  },
  poweredContainer: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  powered: {},
  listView: {},
  row: {
    padding: 13,
    height: 44,
    flexDirection: 'row',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c8c7cc',
  },
  description: {},
  loader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    height: 20,
  },
};

export default class GooglePlacesAutocomplete extends Component {
  _isMounted = false;
  _results = [];
  _requests = [];

  constructor(props) {
    super(props);
    this.state = this.getInitialState.call(this);
  }

  getInitialState = () => ({
    text: this.props.getDefaultValue(),
    dataSource: this.buildRowsFromResults([]),
    listViewDisplayed:
      this.props.listViewDisplayed === 'auto'
        ? false
        : this.props.listViewDisplayed,
    url: this.getRequestUrl(this.props.requestUrl),
  });

  getRequestUrl = (requestUrl) => {
    if (requestUrl) {
      if (requestUrl.useOnPlatform === 'all') {
        return requestUrl.url;
      }
      if (requestUrl.useOnPlatform === 'web') {
        return Platform.select({
          web: requestUrl.url,
          default: 'https://maps.googleapis.com/maps/api',
        });
      }
    } else {
      return 'https://maps.googleapis.com/maps/api';
    }
  };

  requestShouldUseWithCredentials = () =>
    this.state.url === 'https://maps.googleapis.com/maps/api';

  hasNavigator = () => {
    if (navigator && navigator.geolocation) {
      return true;
    } else {
      console.warn(
        'If you are using React Native v0.60.0+ you must follow these instructions to enable currentLocation: https://git.io/Jf4AR',
      );
      return false;
    }
  };

  setAddressText = (address) => this.setState({ text: address });

  getAddressText = () => this.state.text;

  buildRowsFromResults = (results) => {
    let res = [];

    if (
      results.length === 0 ||
      this.props.predefinedPlacesAlwaysVisible === true
    ) {
      res = [...this.props.predefinedPlaces];

      if (this.props.currentLocation === true && this.hasNavigator()) {
        res.unshift({
          description: this.props.currentLocationLabel,
          isCurrentLocation: true,
        });
      }
    }

    res = res.map((place) => ({
      ...place,
      isPredefinedPlace: true,
    }));

    return [...res, ...results];
  };

  UNSAFE_componentWillMount() {
    this._request = this.props.debounce
      ? debounce(this._request, this.props.debounce)
      : this._request;
  }

  componentDidMount() {
    // This will load the default value's search results after the view has
    // been rendered
    this._handleChangeText(this.state.text);
    this._isMounted = true;
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    let listViewDisplayed = this.state.listViewDisplayed;

    if (nextProps.listViewDisplayed !== 'auto') {
      listViewDisplayed = nextProps.listViewDisplayed;
    }

    if (
      typeof nextProps.text !== 'undefined' &&
      this.state.text !== nextProps.text
    ) {
      this.setState(
        {
          listViewDisplayed: listViewDisplayed,
        },
        () => this._handleChangeText(nextProps.text),
      );
    } else {
      this.setState({
        listViewDisplayed: listViewDisplayed,
      });
    }
  }

  componentWillUnmount() {
    this._abortRequests();
    this._isMounted = false;
  }

  _abortRequests = () => {
    this._requests.map((i) => i.abort());
    this._requests = [];
  };

  supportedPlatform(from) {
    if (Platform.OS === 'web' && !this.props.requestUrl) {
      console.warn(
        'This library cannot be used for the web unless you specify the requestUrl prop. See https://git.io/JflFv for more for details.',
      );
      return false;
    } else {
      return true;
    }
  }

  /**
   * This method is exposed to parent components to focus on textInput manually.
   * @public
   */
  triggerFocus = () => {
    if (this.refs.textInput) this.refs.textInput.focus();
  };

  /**
   * This method is exposed to parent components to blur textInput manually.
   * @public
   */
  triggerBlur = () => {
    if (this.refs.textInput) this.refs.textInput.blur();
  };

  getCurrentLocation = () => {
    let options = {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 1000,
    };

    if (this.props.enableHighAccuracyLocation && Platform.OS === 'android') {
      options = {
        enableHighAccuracy: true,
        timeout: 20000,
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (this.props.nearbyPlacesAPI === 'None') {
          let currentLocation = {
            description: this.props.currentLocationLabel,
            geometry: {
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
            },
          };

          this._disableRowLoaders();
          this.props.onPress(currentLocation, currentLocation);
        } else {
          this._requestNearby(
            position.coords.latitude,
            position.coords.longitude,
          );
        }
      },
      (error) => {
        this._disableRowLoaders();
        alert(error.message);
      },
      options,
    );
  };

  _onPress = (rowData) => {
    if (
      rowData.isPredefinedPlace !== true &&
      this.props.fetchDetails === true
    ) {
      if (rowData.isLoading === true) {
        // already requesting
        return;
      }

      Keyboard.dismiss();

      this._abortRequests();

      // display loader
      this._enableRowLoader(rowData);
      if (this.props.isMiratedPlacesAPI || this.props.isMigratedPlacesAPI) {
        this._getPlaceDetails(rowData);
        return;
      }

      // fetch details
      const request = new XMLHttpRequest();
      this._requests.push(request);
      request.timeout = this.props.timeout;
      request.ontimeout = this.props.onTimeout;
      request.onreadystatechange = () => {
        if (request.readyState !== 4) return;

        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);
          if (responseJSON.status === 'OK') {
            if (this._isMounted === true) {
              const details = responseJSON.result;
              this._disableRowLoaders();
              this._onBlur();

              this.setState({
                text: this._renderDescription(rowData),
              });

              delete rowData.isLoading;
              this.props.onPress(rowData, details);
            }
          } else {
            this._disableRowLoaders();

            if (this.props.autoFillOnNotFound) {
              this.setState({
                text: this._renderDescription(rowData),
              });
              delete rowData.isLoading;
            }

            if (!this.props.onNotFound) {
              console.warn(
                'google places autocomplete: ' + responseJSON.status,
              );
            } else {
              this.props.onNotFound(responseJSON);
            }
          }
        } else {
          this._disableRowLoaders();

          if (!this.props.onFail) {
            console.warn(
              'google places autocomplete: request could not be completed or has been aborted',
            );
          } else {
            this.props.onFail(
              'request could not be completed or has been aborted',
            );
          }
        }
      };

      request.open(
        'GET',
        `${this.state.url}/place/details/json?` +
          Qs.stringify({
            key: this.props.query.key,
            placeid: rowData.place_id,
            language: this.props.query.language,
            ...this.props.GooglePlacesDetailsQuery,
          }),
      );
      request.withCredentials = this.requestShouldUseWithCredentials();
      request.send();
    } else if (rowData.isCurrentLocation === true) {
      // display loader
      this._enableRowLoader(rowData);

      this.setState({
        text: this._renderDescription(rowData),
      });

      delete rowData.isLoading;
      this.getCurrentLocation();
    } else {
      this.setState({
        text: this._renderDescription(rowData),
      });

      this._onBlur();
      delete rowData.isLoading;
      let predefinedPlace = this._getPredefinedPlace(rowData);

      // sending predefinedPlace as details for predefined places
      this.props.onPress(predefinedPlace, predefinedPlace);
    }
  };



  _getPlaceDetails = async (rowData = {}) => {
    if (!rowData && !rowData?.place_id) {
      return;
    }
    const API_KEY = this.props.migratedAPIKey;

    try {
      const response = await Axios.get(
        `https://places.googleapis.com/v1/places/${rowData.place_id}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': '*'
          }
        }
      );
      if (response.status === 200) {
        if (this._isMounted) {
          const details = response.data;
          const updatedDetails = { ...details};
          updatedDetails.geometry = {
            location: {
              lat: details?.location?.latitude,
              lng: details?.location?.longitude,
            }
          }
          this._disableRowLoaders();
          this._onBlur();

          this.setState({
            text: this._renderDescription(rowData),
          });

          delete rowData.isLoading;
          this.props.onPress(rowData, updatedDetails);
        }
      } else {
        this._disableRowLoaders();
        if (this.props.autoFillOnNotFound) {
          this.setState({
            text: this._renderDescription(rowData),
          });
          delete rowData.isLoading;
        }

        if (!this.props.onNotFound) {
          console.warn(`Google Places Autocomplete: ${response.status}`);
        } else {
          this.props.onNotFound(response);
        }
      }
    } catch (error) {
      this._disableRowLoaders();

      if (!this.props.onFail) {
        console.warn(
          'google places autocomplete: request could not be completed or has been aborted',
        );
      } else {
        this.props.onFail(
          'request could not be completed or has been aborted',
        );
      }
    }
  };

  _getAutoComplete = async (text) => {
    if (!text?.trim()) {
      return;
    }
    const locationBias = this.props.locationBias || {};
    const includedRegionCodes = this.props.countryCode || 'AE'
    const requestBody = {
      input: text,
      includedRegionCodes: [includedRegionCodes],  // Restrict results to UAE
      includedPrimaryTypes: [
        "locality", 
        "sublocality", 
        "point_of_interest", 
        "geocode", 
        "establishment"
      ],
      ...locationBias
    };
    try {
      const results = await Axios.post(
        "https://places.googleapis.com/v1/places:autocomplete", 
        requestBody, 
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": this.props.migratedAPIKey,
            "X-Goog-FieldMask": "*"
          }
        }
      )
      const formattedResults = [];
      results?.data?.suggestions?.forEach((res) => {
        const placePrediction = res?.placePrediction;
        const placedObject = {
          description: placePrediction?.text?.text,
          place_id: placePrediction?.placeId,
          types: placePrediction?.types,
          reference: placePrediction?.placeId,
          structured_formatting: {
            main_text: placePrediction?.structuredFormat?.mainText?.text,
            secondary_text: placePrediction?.structuredFormat?.secondaryText?.text
          }
        }
        formattedResults.push(placedObject)
      });
      if (formattedResults?.length) {
        this._results = formattedResults;
        this.setState({
          dataSource: this.buildRowsFromResults(formattedResults),
        });
      }
    } catch (error) {
      
      console.error("Error searching places:", error?.response?.data || error?.message);
    }
  };

  _enableRowLoader = (rowData) => {
    let rows = this.buildRowsFromResults(this._results);
    for (let i = 0; i < rows.length; i++) {
      if (
        rows[i].place_id === rowData.place_id ||
        (rows[i].isCurrentLocation === true &&
          rowData.isCurrentLocation === true)
      ) {
        rows[i].isLoading = true;
        this.setState({
          dataSource: rows,
        });
        break;
      }
    }
  };

  _disableRowLoaders = () => {
    if (this._isMounted === true) {
      for (let i = 0; i < this._results.length; i++) {
        if (this._results[i].isLoading === true) {
          this._results[i].isLoading = false;
        }
      }

      this.setState({
        dataSource: this.buildRowsFromResults(this._results),
      });
    }
  };

  _getPredefinedPlace = (rowData) => {
    if (rowData.isPredefinedPlace !== true) {
      return rowData;
    }

    for (let i = 0; i < this.props.predefinedPlaces.length; i++) {
      if (this.props.predefinedPlaces[i].description === rowData.description) {
        return this.props.predefinedPlaces[i];
      }
    }

    return rowData;
  };

  _filterResultsByTypes = (unfilteredResults, types) => {
    if (types.length === 0) return unfilteredResults;

    const results = [];
    for (let i = 0; i < unfilteredResults.length; i++) {
      let found = false;

      for (let j = 0; j < types.length; j++) {
        if (unfilteredResults[i].types.indexOf(types[j]) !== -1) {
          found = true;
          break;
        }
      }

      if (found === true) {
        results.push(unfilteredResults[i]);
      }
    }
    return results;
  };

  _requestNearby = (latitude, longitude) => {
    this._abortRequests();

    if (
      latitude !== undefined &&
      longitude !== undefined &&
      latitude !== null &&
      longitude !== null
    ) {
      const request = new XMLHttpRequest();
      this._requests.push(request);
      request.timeout = this.props.timeout;
      request.ontimeout = this.props.onTimeout;
      request.onreadystatechange = () => {
        if (request.readyState !== 4) {
          return;
        }

        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);

          this._disableRowLoaders();

          if (typeof responseJSON.results !== 'undefined') {
            if (this._isMounted === true) {
              var results = [];
              if (this.props.nearbyPlacesAPI === 'GoogleReverseGeocoding') {
                results = this._filterResultsByTypes(
                  responseJSON.results,
                  this.props.filterReverseGeocodingByTypes,
                );
              } else {
                results = responseJSON.results;
              }

              this.setState({
                dataSource: this.buildRowsFromResults(results),
              });
            }
          }
          if (typeof responseJSON.error_message !== 'undefined') {
            if (!this.props.onFail)
              console.warn(
                'google places autocomplete: ' + responseJSON.error_message,
              );
            else {
              this.props.onFail(responseJSON.error_message);
            }
          }
        } else {
          // console.warn("google places autocomplete: request could not be completed or has been aborted");
        }
      };

      let url = '';
      if (this.props.nearbyPlacesAPI === 'GoogleReverseGeocoding') {
        // your key must be allowed to use Google Maps Geocoding API
        url =
          `${this.state.url}/geocode/json?` +
          Qs.stringify({
            latlng: latitude + ',' + longitude,
            key: this.props.query.key,
            ...this.props.GoogleReverseGeocodingQuery,
          });
      } else {
        url =
          `${this.state.url}/place/nearbysearch/json?` +
          Qs.stringify({
            location: latitude + ',' + longitude,
            key: this.props.query.key,
            ...this.props.GooglePlacesSearchQuery,
          });
      }

      request.open('GET', url);

      request.withCredentials = this.requestShouldUseWithCredentials();

      request.send();
    } else {
      this._results = [];
      this.setState({
        dataSource: this.buildRowsFromResults([]),
      });
    }
  };

  _getPlacesDetailsByPlaceId = async (placeId = '') => {
    if (!placeId) {
      return;
    }
    const url = `${this.state.url}/place/details/json?` +
      Qs.stringify({
        key: this.props.query.key,
        placeid: placeId,
        language: this.props.query.language,
        ...this.props.GooglePlacesDetailsQuery,
      })
    try {
      const result = await (await fetch(url)).json();
      const sameCountryList = result?.result?.address_components?.some((add, index) => `${add?.short_name}`?.toLowerCase() === this.props.countryCode);
      return sameCountryList ? placeId : undefined;
    }
    catch (err) {
      console.error(err)
    }
  }
  _request = (text) => {
    this._abortRequests();
    if (this.props?.isMiratedPlacesAPI || this.props.isMigratedPlacesAPI) {
      this._getAutoComplete(text);
      return;
    }
    if (
      this.supportedPlatform() &&
      text &&
      text.length >= this.props.minLength
    ) {
      const request = new XMLHttpRequest();
      this._requests.push(request);
      request.timeout = this.props.timeout;
      request.ontimeout = this.props.onTimeout;
      request.onreadystatechange = async () => {
        if (request.readyState !== 4) {
          return;
        }

        if (request.status === 200) {
          const responseJSON = JSON.parse(request.responseText);
          if (typeof responseJSON.predictions !== 'undefined') {
            if (this._isMounted === true) {
              const results =
                this.props.nearbyPlacesAPI === 'GoogleReverseGeocoding'
                  ? this._filterResultsByTypes(
                      responseJSON.predictions,
                      this.props.filterReverseGeocodingByTypes,
                    )
                  : responseJSON.predictions;

              this._results = results;
              this.setState({
                dataSource: this.buildRowsFromResults(results),
              });
            }
          }
          if (typeof responseJSON.error_message !== 'undefined') {
            if (!this.props.onFail)
              console.warn(
                'google places autocomplete: ' + responseJSON.error_message,
              );
            else {
              this.props.onFail(responseJSON.error_message);
            }
          }
        } else {
          // console.warn("google places autocomplete: request could not be completed or has been aborted");
        }
      };
      if (this.props.preProcess) {
        text = this.props.preProcess(text);
      }
      const url = `${this.state.url}/place/autocomplete/json?&input=` +
        encodeURIComponent(text) +
        '&' +
        Qs.stringify(this.props.query);
      
      const customUrl = `${this.state.url}/place/autocomplete/json?&input=${text}&key=${this.props.query.key}&language=${this.props.language}&components=country:${this.props.countryCode}&types=`
      request.open(
        'GET',
        customUrl,
      );

      request.withCredentials = this.requestShouldUseWithCredentials();

      request.send();
    } else {
      this._results = [];
      this.setState({
        dataSource: this.buildRowsFromResults([]),
      });
    }
  };

  clearText() {
    this.setState({
      text: '',
    });
  }

  _onChangeText = (text) => {
    this._request(text);

    this.setState({
      text: text,
      listViewDisplayed: this._isMounted || this.props.autoFocus,
    });
  };

  _handleChangeText = (text) => {
    this._onChangeText(text);

    const onChangeText =
      this.props &&
      this.props.textInputProps &&
      this.props.textInputProps.onChangeText;

    if (onChangeText) {
      onChangeText(text);
    }
  };

  _getRowLoader() {
    return <ActivityIndicator animating={true} size='small' />;
  }

  _renderRowData = (rowData) => {
    if (this.props.renderRow) {
      return this.props.renderRow(rowData);
    }

    return (
      <Text
        style={[
          this.props.suppressDefaultStyles ? {} : defaultStyles.description,
          this.props.styles.description,
          rowData.isPredefinedPlace
            ? this.props.styles.predefinedPlacesDescription
            : {},
        ]}
        numberOfLines={this.props.numberOfLines}
      >
        {this._renderDescription(rowData)}
      </Text>
    );
  };

  _renderDescription = (rowData) => {
    if (this.props.renderDescription) {
      return this.props.renderDescription(rowData);
    }

    return rowData.description || rowData.formatted_address || rowData.name;
  };

  _renderLoader = (rowData) => {
    if (rowData.isLoading === true) {
      return (
        <View
          style={[
            this.props.suppressDefaultStyles ? {} : defaultStyles.loader,
            this.props.styles.loader,
          ]}
        >
          {this._getRowLoader()}
        </View>
      );
    }

    return null;
  };

  _renderRow = (rowData = {}, sectionID, rowID) => {
    return (
      <ScrollView
        style={{ flex: 1 }}
        scrollEnabled={this.props.isRowScrollable}
        keyboardShouldPersistTaps={this.props.keyboardShouldPersistTaps}
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <TouchableHighlight
          style={{ width: WINDOW.width }}
          onPress={() => this._onPress(rowData)}
          underlayColor={this.props.listUnderlayColor || '#c8c7cc'}
        >
          <View
            style={[
              this.props.suppressDefaultStyles ? {} : defaultStyles.row,
              this.props.styles.row,
              rowData.isPredefinedPlace ? this.props.styles.specialItemRow : {},
            ]}
          >
            {this._renderLoader(rowData)}
            {this._renderRowData(rowData)}
          </View>
        </TouchableHighlight>
      </ScrollView>
    );
  };

  _renderSeparator = (sectionID, rowID) => {
    if (rowID == this.state.dataSource.length - 1) {
      return null;
    }

    return (
      <View
        key={`${sectionID}-${rowID}`}
        style={[
          this.props.suppressDefaultStyles ? {} : defaultStyles.separator,
          this.props.styles.separator,
        ]}
      />
    );
  };

  _onBlur = () => {
    this.triggerBlur();

    this.setState({
      listViewDisplayed: false,
    });
  };

  _onFocus = () => this.setState({ listViewDisplayed: true });

  _renderPoweredLogo = () => {
    if (!this._shouldShowPoweredLogo()) {
      return null;
    }

    return (
      <View
        style={[
          this.props.suppressDefaultStyles ? {} : defaultStyles.row,
          defaultStyles.poweredContainer,
          this.props.styles.poweredContainer,
        ]}
      >
        <Image
          style={[
            this.props.suppressDefaultStyles ? {} : defaultStyles.powered,
            this.props.styles.powered,
          ]}
          resizeMode='contain'
          source={require('./images/powered_by_google_on_white.png')}
        />
      </View>
    );
  };

  _shouldShowPoweredLogo = () => {
    if (
      !this.props.enablePoweredByContainer ||
      this.state.dataSource.length == 0
    ) {
      return false;
    }

    for (let i = 0; i < this.state.dataSource.length; i++) {
      let row = this.state.dataSource[i];

      if (
        !row.hasOwnProperty('isCurrentLocation') &&
        !row.hasOwnProperty('isPredefinedPlace')
      ) {
        return true;
      }
    }

    return false;
  };

  _renderLeftButton = () => {
    if (this.props.renderLeftButton) {
      return this.props.renderLeftButton();
    }
  };

  _renderRightButton = () => {
    if (this.props.renderRightButton) {
      return this.props.renderRightButton();
    }
  };

  _getFlatList = () => {
    const keyGenerator = () => Math.random().toString(36).substr(2, 10);

    if (
      this.supportedPlatform() &&
      (this.state.text !== '' ||
        this.props.predefinedPlaces.length ||
        this.props.currentLocation === true) &&
      this.state.listViewDisplayed === true
    ) {
      return (
        <FlatList
          scrollEnabled={!this.props.disableScroll}
          style={[
            this.props.suppressDefaultStyles ? {} : defaultStyles.listView,
            this.props.styles.listView,
          ]}
          data={this.state.dataSource}
          keyExtractor={keyGenerator}
          extraData={[this.state.dataSource, this.props]}
          ItemSeparatorComponent={this._renderSeparator}
          renderItem={({ item }) => this._renderRow(item)}
          ListHeaderComponent={
            this.props.renderHeaderComponent &&
            this.props.renderHeaderComponent(this.state.text)
          }
          ListFooterComponent={this._renderPoweredLogo}
          {...this.props}
        />
      );
    }

    return null;
  };
  render() {
    let {
      onFocus,
      clearButtonMode,
      InputComp,
      ...userProps
    } = this.props.textInputProps;
    const TextInputComp = InputComp ? InputComp : TextInput;
    return (
      <View
        style={[
          this.props.suppressDefaultStyles ? {} : defaultStyles.container,
          this.props.styles.container,
        ]}
        pointerEvents='box-none'
      >
        {!this.props.textInputHide && (
          <View
            style={[
              this.props.suppressDefaultStyles
                ? {}
                : defaultStyles.textInputContainer,
              this.props.styles.textInputContainer,
            ]}
          >
            {this._renderLeftButton()}
            <TextInputComp
              ref='textInput'
              editable={this.props.editable}
              returnKeyType={this.props.returnKeyType}
              keyboardAppearance={this.props.keyboardAppearance}
              autoFocus={this.props.autoFocus}
              style={[
                this.props.suppressDefaultStyles ? {} : defaultStyles.textInput,
                this.props.styles.textInput,
              ]}
              value={this.state.text}
              placeholder={this.props.placeholder}
              onSubmitEditing={this.props.onSubmitEditing}
              placeholderTextColor={this.props.placeholderTextColor}
              onFocus={
                onFocus
                  ? () => {
                      this._onFocus();
                      onFocus();
                    }
                  : this._onFocus
              }
              onBlur={this._onBlur}
              underlineColorAndroid={this.props.underlineColorAndroid}
              clearButtonMode={
                clearButtonMode ? clearButtonMode : 'while-editing'
              }
              {...userProps}
              onChangeText={this._handleChangeText}
            />
            {this._renderRightButton()}
          </View>
        )}
        {this._getFlatList()}
        {this.props.children}
      </View>
    );
  }
}

GooglePlacesAutocomplete.propTypes = {
  placeholder: PropTypes.string,
  placeholderTextColor: PropTypes.string,
  underlineColorAndroid: PropTypes.string,
  returnKeyType: PropTypes.string,
  keyboardAppearance: PropTypes.oneOf(['default', 'light', 'dark']),
  onPress: PropTypes.func,
  onNotFound: PropTypes.func,
  onFail: PropTypes.func,
  minLength: PropTypes.number,
  fetchDetails: PropTypes.bool,
  autoFocus: PropTypes.bool,
  autoFillOnNotFound: PropTypes.bool,
  getDefaultValue: PropTypes.func,
  timeout: PropTypes.number,
  onTimeout: PropTypes.func,
  query: PropTypes.object,
  GoogleReverseGeocodingQuery: PropTypes.object,
  GooglePlacesSearchQuery: PropTypes.object,
  GooglePlacesDetailsQuery: PropTypes.object,
  styles: PropTypes.object,
  textInputProps: PropTypes.object,
  enablePoweredByContainer: PropTypes.bool,
  predefinedPlaces: PropTypes.array,
  currentLocation: PropTypes.bool,
  currentLocationLabel: PropTypes.string,
  nearbyPlacesAPI: PropTypes.string,
  enableHighAccuracyLocation: PropTypes.bool,
  filterReverseGeocodingByTypes: PropTypes.array,
  predefinedPlacesAlwaysVisible: PropTypes.bool,
  enableEmptySections: PropTypes.bool,
  renderDescription: PropTypes.func,
  renderRow: PropTypes.func,
  renderLeftButton: PropTypes.func,
  renderRightButton: PropTypes.func,
  listUnderlayColor: PropTypes.string,
  debounce: PropTypes.number,
  isRowScrollable: PropTypes.bool,
  text: PropTypes.string,
  textInputHide: PropTypes.bool,
  suppressDefaultStyles: PropTypes.bool,
  numberOfLines: PropTypes.number,
  onSubmitEditing: PropTypes.func,
  editable: PropTypes.bool,
  requestUrl: PropTypes.shape({
    url: PropTypes.string,
    useOnPlatform: PropTypes.oneOf(['web', 'all']),
  }),
  isMiratedPlacesAPI: PropTypes.bool,
  isMigratedPlacesAPI: PropTypes.bool,
  migratedAPIKey: PropTypes.string,
  locationBias: PropTypes.object
};
GooglePlacesAutocomplete.defaultProps = {
  placeholder: 'Search',
  placeholderTextColor: '#A8A8A8',
  isRowScrollable: true,
  underlineColorAndroid: 'transparent',
  returnKeyType: 'search',
  keyboardAppearance: 'default',
  onPress: () => {},
  onNotFound: () => {},
  onFail: () => {},
  minLength: 0,
  fetchDetails: false,
  autoFocus: false,
  autoFillOnNotFound: false,
  keyboardShouldPersistTaps: 'always',
  getDefaultValue: () => '',
  timeout: 20000,
  onTimeout: () => console.warn('google places autocomplete: request timeout'),
  query: {
    key: 'missing api key',
    language: 'en',
    types: 'geocode',
  },
  GoogleReverseGeocodingQuery: {},
  GooglePlacesDetailsQuery: {},
  GooglePlacesSearchQuery: {
    rankby: 'distance',
    type: 'restaurant',
  },
  styles: {},
  textInputProps: {},
  enablePoweredByContainer: true,
  predefinedPlaces: [],
  currentLocation: false,
  currentLocationLabel: 'Current location',
  nearbyPlacesAPI: 'GooglePlacesSearch',
  enableHighAccuracyLocation: true,
  filterReverseGeocodingByTypes: [],
  predefinedPlacesAlwaysVisible: false,
  enableEmptySections: true,
  listViewDisplayed: 'auto',
  debounce: 0,
  textInputHide: false,
  suppressDefaultStyles: false,
  numberOfLines: 1,
  onSubmitEditing: () => {},
  editable: true,
  isMiratedPlacesAPI: false,
  isMigratedPlacesAPI: false,
  migratedAPIKey: '',
  locationBias: {
    rectangle: {
      low: { latitude: 26.5, longitude: 51.6 },
      high: { latitude: 26.5, longitude: 56.4 },
    },
  },
};

// this function is still present in the library to be retrocompatible with version < 1.1.0
const create = function create(options = {}) {
  return React.createClass({
    render() {
      return (
        <GooglePlacesAutocomplete ref='GooglePlacesAutocomplete' {...options} />
      );
    },
  });
};

export { GooglePlacesAutocomplete, create };