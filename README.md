# 晋戏影像史料审定

《晋戏》二十多年田野影像的审定后台：整理山西三十八个剧种的源流、剧目、艺人、戏班、地点、拍摄批次与审定文字，并管理四个发布渠道各自的授权范围。

## 资料结构

- `contracts/archive.schema.json` —— 审定档案的完整结构契约（剧种、人物、戏班、地点、剧目、拍摄批次、来源、影像、许可、审定文字、事实更正、归并、审计事件）
- `contracts/context.schema.json` —— 早期基础资料格式，保留兼容
- `fixtures/archive.sample.json` —— 可公开使用的样例档案（全部虚构）
- `fixtures/context.json` —— 基础资料样例

## 分层规则

**原件封存（`src/review.js` → `reviewOriginalIntegrity`）**
原件影像登记于 `originals/` 并记录 sha256；任何编辑只能产出 `derivatives/` 副本且必须声明 `replaces_original=false`。编辑稿替换原件、原件哈希被改动都会报错。

**事实更正（`reviewCorrections`）**
更正必须附来源；`accepted` 状态的更正必须有在册专家签署；被更正的原说法保留在 `previous` 字段中，审定链可回溯。

**归并（`reviewMerges`）**
重复底片（`duplicate_negative`）与同人异名（`same_person_alias`）可以归并，但必须写明依据并附来源。归并只建立指向（`merged_into` / `retained_id`），成员记录保留不删，可逆。

**审定文字（`reviewCaptionChain`）**
每幅影像的说明文字按版本留存；任一历史版本记录过身份争议，现行版本就必须保留面向公众的存疑说明——发布不得抹平史料的不确定性。

**分渠道发布（`src/publish.js`）**
展览、出版、研究下载、青少年传播四个渠道各自检查许可版本中的授权项；青少年渠道额外要求水印副本。`buildManifest` 生成发布清单，每行都能指回审定文字版本、许可版本、归并关系与未决争议；`tracePublishedImage` 从清单行反查完整审定链。未授权渠道进入 `blocked` 并说明原因，不会静默混入。

## 研究人员视图

`personView` 把同一位艺人的多个姓名（本名、艺名、同音异写）、归并记录与未决身份争议汇集到一页，配合原始影像、各说法来源与审定过程同时呈现；公众发布版本则只包含许可允许的照片与文字。

## 本地校验

```sh
npm test
```

运行项目自带测试即可确认样例档案可读取、结构与引用完整，且上述审定规则全部生效。所有示例均为虚构数据，不含真实个人信息、账号或访问凭据。
