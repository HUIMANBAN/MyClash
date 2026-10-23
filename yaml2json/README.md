# yaml2json

将 YAML 转换为格式化的 JSON。

```powershell
npm install
node index.js input.yaml output.json
```

不写输出路径时，JSON 会输出到终端：

```powershell
node index.js input.yaml
```

也可以从标准输入读取：

```powershell
Get-Content input.yaml -Raw | node index.js -
```

如果 YAML 中包含多个以 `---` 分隔的文档，输出会是一个 JSON 数组。
