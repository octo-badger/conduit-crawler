

exports.id = 'intervalz';

let tokens = [];


exports.add = (action, period) => 
{
    let token = setInterval(action, period);
    tokens.push(token);
};

exports.clearAll = () =>
{
    tokens.forEach(token => clearInterval(token));
}