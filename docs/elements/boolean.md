### `IoBoolean` `<io-boolean>` ###

Input element for `Boolean` data type. It can be configured to display custom `true` or `false` text depending on its `value`.

#### Properties ####

| Property | Type | Description | Default |
|:--------:|:----:|:----------:|:-------:|
| **`value`** | Boolean | Value | `false` |
| **`true`** | String | Text to display when value is True | `'true'` |
| **`false`** | String | Text to display when value is False | `'false'` |

#### Events ####

| Event | Description | Detail |
|:--------:|:----:|:----------:|
| **`button-clicked`** | Clicked |  `value`, `action` |
