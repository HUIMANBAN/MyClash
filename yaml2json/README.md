# yaml2json

将 YAML 转换为默认导出 JavaScript 对象的 ES 模块。

```powershell
npm install
node index.js input.yaml output.js
```

不写输出路径时，JavaScript 会输出到终端：

```powershell
node index.js input.yaml
```

也可以从标准输入读取：

```powershell
Get-Content input.yaml -Raw | node index.js -
```

生成结果可以直接导入：

```js
import config from "./output.js";
```

如果 YAML 中包含多个以 `---` 分隔的文档，默认导出的对象会是一个数组。
