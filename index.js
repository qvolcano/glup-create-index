const os = require("os");
var through2 = require('through2');
const path = require("path")
const File = require("vinyl");
const fs = require("fs")

module.exports = modify;
function modify(package_json_path) {
    let count = 0;
    let files = [];
    let tree = {};

    function define_tree(file_path, cwd) {
        while (true) {
            let dirname = path.dirname(file_path);
            let basename = path.basename(file_path).replace(path.extname(file_path), "")
            if (tree[dirname] == null) {
                tree[dirname] = {};
            }
            tree[dirname][basename] = cwd;
            tree[dirname]["_cwd_"] = cwd;
            file_path = dirname;
            if (dirname.length > 1) {
            } else {
                break
            }
        }
    }
    var stream = through2.obj(function (file, encoding, callback) {
        if(file.relative.substr(-3)!=".ts"){
            return callback();
        }
        files[file.relative] = file;
        //如果文件为空，不做任何操作，转入下一个操作，即下一个pipe
        if (file.isNull()) {
            // this.push(file);
            return callback();
        }
        count++
        //插件不支持对stream直接操作，抛出异常
        if (file.isStream()) {
            console.log('file is stream!');
            this.emit('error');
            return callback();
        }
        let file_content = file.contents.toString();
        if (file_content.indexOf("export") >= 0) {
            if (path.basename(file.relative) != "index.ts") {
                define_tree(file.relative, file.cwd)
            } else {
                define_tree(path.dirname(file.relative), file.cwd)
            }
        }
        callback();
    }, function (callback) {
        for (let i in tree) {
            let index_path = path.join(i, "index.ts");
            let iswrite = true;
            if (files[index_path]) {
                var content = files[index_path].contents.toString();
                if (content.indexOf("auto-create-index") == -1) {
                    iswrite = false;
                }
            }
            if (iswrite) {
                let list = ["/***auto-create-index***/"];
                let cwd = tree[i]["_cwd_"]
                for (let l in tree[i]) {
                    if (l == "_cwd_") {
                        continue
                    }
                    list.push('export * from "./' + l + '";');
                }
                let content = list.join(os.EOL);
                let file = new File({
                    path: index_path,
                    cwd: cwd,
                    contents: Buffer.from(content)
                });
                files[index_path]=file
                this.push(file);
            }
        }


        let main_index = files["index.ts"];
        let index_content = main_index.contents.toString();
        // let index_content = ""
        let reg = new RegExp('export . from "\./(.*)"', "g");
        let matched = [];
        index_content.replace(/export . from "\.\/(.*)"/g, function (match, group, group2) {
            matched.push(group);
        })

        let package = files["package.json"];
        if(package){
            let content = JSON.parse(package.contents.toString());
            modify_package_json(content,matched);
            package.contents = Buffer.from(JSON.stringify(content, null, "  "));
            this.push(package);
        }else if(package_json_path){
            package = fs.readFileSync(package_json_path,"utf-8");
            let content = JSON.parse(package.toString());
            modify_package_json(content,matched);
            fs.writeFileSync(package_json_path,JSON.stringify(content, null, "  "),"utf-8")
        }
        console.log('处理完毕!', count);
        callback();
    });
    return stream;
}


function modify_package_json(content,matched) {
    if (content["typesVersions"] == null) {
        content["typesVersions"] = {};
    }
    if (content["exports"] == null) {
        content["exports"] = {};
    }
    if (content["typesVersions"]["*"] == null) {
        content["typesVersions"]["*"] = {};
    }
    for (let i of matched) {
        content["typesVersions"]["*"][i] = ["dist/" + i + "/index.d.ts"];
        content["exports"]["./" + i] = {
            "require": "./dist/" + i + "/index.js",
            "import": "./dist/" + i + "/index.js"
        }
    }
}
