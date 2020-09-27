const request = require('request');

const options = {
  method: 'GET',
  url: 'https://hiringcoders13.vtexcommercestable.com.br/api/oms/pvt/orders/[numero do pedido]',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-vtex-api-appkey': '[APP Key da VTEX]',
    'x-vtex-api-apptoken': '[APP Token VTEX]',
    janus_sid: '[ID de sessão]'
  }
};

const settings = {
    client_id: '[ID no melhor envio]',
    client_secret: '[Token do Melhor Envio]',
    sandbox: true,
    bearer: '[Token no Melhor Envio, esse gerado no  painel]',
    redirect_uri: 'https://hiringcoders13.myvtex.com',
    request_scope: 'cart-read cart-write companies-read companies-write coupons-read coupons-write notifications-read orders-read products-read products-write purchases-read shipping-calculate shipping-cancel shipping-checkout shipping-companies shipping-generate shipping-preview shipping-print shipping-share shipping-tracking ecommerce-shipping transactions-read users-read users-write webhooks-read webhooks-write',
    state: ''
};

const me = require('melhor-envio').config(settings);
let auth = me.auth.getAuth();

request(options, async function(error, response, body) {
    if (error) throw new Error(error);
    // Passo 1    
    const pedido_vtex = JSON.parse(body);
    // Passo 2
    const payload = {
        "service": 2, // 1 = pac, 2 = sedex. Como só vou usar os correios , fica assim
        "from": { // Dados da loja
            "name": "",
            "phone": "",
            "email": "",
            "document": "", 
            "address": "",
            "complement": "",
            "number": "",
            "district": "",
            "city": "",
            "state_abbr": "",
            "country_id": "",
            "postal_code": "",
            "note": ""
        },
        "to": { // Dados do destinatário, aka. cliente
            "name": pedido_vtex.clientProfileData.firstName + " " + pedido_vtex.clientProfileData.lastName,
            "phone": pedido_vtex.clientProfileData.phone, // DDD+Telefone
            "email": pedido_vtex.clientProfileData.email, // E-mail, desconfio ser opcional
            "document": pedido_vtex.clientProfileData.document, // CPF, sem ponto/traço
            //"company_document": "89794131000101", // CNPJ, sem ponto/traço
            //"state_register": "123456", // Inscrição Estadual, sem ponto/traço
            "address": pedido_vtex.shippingData.address.street, // Endereço
            "complement": pedido_vtex.shippingData.address.complement, // Complemento do endereço
            "number": pedido_vtex.shippingData.address.number, // Número. You know the drill
            "district": pedido_vtex.shippingData.address.neighborhood, // Bairro
            "city": pedido_vtex.shippingData.address.city, // Município
            "state_abbr": pedido_vtex.shippingData.address.state, // UF
            "country_id": "BR", // País. Se o negócio só funciona com Brasil, manda o BRzão hardcoded mesmo e fim de papo
            "postal_code": pedido_vtex.shippingData.address.postalCode.substr(0,5) + pedido_vtex.shippingData.address.postalCode.substr(6,3), // CEP, sem traço
            "note": pedido_vtex.shippingData.address.reference // Observações, como ponto de referência, por exemplo
        },  
        /*"products": [ // Opcional, na verdade. Só precisa mesmo se tiver declarando o conteúdo
            {
                "name": "Papel adesivo para etiquetas 1",
                "quantity": 3,
                "unitary_value": 0.5
            },
            {
                "name": "Papel adesivo para etiquetas 2",
                "quantity": 1,
                "unitary_value": 1.5
            }
        ],*/
        "volumes": [ // Obrigatório, dimensões e peso do pacote
            {
                "height": 10, // Respectivamente, altura, largura e comprimento em CM
                "width": 12,
                "length": 15,
                "weight": 0.1 // Peso em KG, no mínimo 10 gramas
            }
        ],
        "options": {
            "insurance_value": 0, // Seguro
            "receipt": false, // Aviso de entrega
            "own_hand": false, // Disponível só para os Correios
            "reverse": false, // Se é logística reversa, ou seja, devolução
            "non_commercial": true, // Deixe true por enquanto
            "invoice": { // Nota fiscal, obrigatória se a transportadora não for os Correios
                "key": "[nota fiscal]"
            },
            "platform": "VTEX",
            "tags": [
                {
                    "tag": pedido_vtex.orderId, // Identificação do pedido na plataforma VTEX
                    "url": "" // Link direto para o pedido na plataforma VTEX, se possível. Opcional.
                }
            ]
        }
    }
    
    const cotacao = await me.shipment.calculate(payload);
    console.log(cotacao);

    // Passo 3    
    let carrinho = await me.user.cart(payload);
    console.log(JSON.stringify(carrinho));
    
    // Passo 4
    let id_pedido = [carrinho.id];

    // Passo 5    
    let pagamento = await me.shipment.checkout(id_pedido);

    // Passo 6
    const etiquetas = await me.shipment.generate(id_pedido);

    // Passo 7
    const uri = await me.shipment.print(id_pedido);
    response.redirect_uri(uri);

});

/**
 * Ok. O lance é o seguinte: O processo para gerar uma etiqueta é:
 * 
 * 1. Cria o pedido e salva os dados de frete nele
 *   - Aqui eu vou acessar os dados do pedido dentro da VTEX pra poder gerar o pedido. O que eu preciso é:
 *     - Produtos: Nome e preço de cada um
 *     - Dados de entrega: nome e endereço do cliente, com CEP
 *     - Dados da origem: endereço do lugar de onde vai sair o pacote, no começo pode ser hard coded
 *     - Dados do pacote (preenchidos na administração da loja)
 * 
 * 2. Monta payload com dados de 1 item do array de packages da cotação no parâmetro package.
 *   - Para cada pacote esse item se repete.
 * 3. Realiza a requisição para inserir frete no carrinho do Melhor Envio (repete para cada pacote)
 *   3.1. Requisição
 *      POST {{url}}/api/v2/me/cart
 *      -H Authorization: Bearer {{token}}
 *      JSON {service, from[], to[], products[], package, options[]}
 *   3.2. Resposta:
 *      JSON: {dados da etiqueta criada}
 * 4. Processa payload do envio e salva `id` para futuras interações
 * 5. Solicita pagamento das etiquetas utilizando o saldo do usuário na carteira do Melhor Envio
 *   5.1. Requisição:
 *      POST {{url}}/api/v2/me/shipment/checkout
 *      -H Authorization: Bearer {{token}}
 *      JSON {orders[]}
 *   5.2. Resposta esperada:
 *      JSON: {dados da compra}
 *   5.3. Resposta em caso de erro:
 *      JSON: {error}
 * 6. Solicita a geração da etiqueta comprada informando o `id` salvo no momento da Inserção ao carrinho
 *   6.1. Requisição:
 *      POST {{url}}/api/v2/me/shipment/generate
 *      -H Authorization: Bearer {{token}}
 *      JSON {orders[]}
 * 7. A etiqueta foi gerada e já está disponível para impressão, solicitar a impressão informando o `id`
 * salvo no momento da Inserção ao carrinho
 *   7.1. Requisição:
 *      POST {{url}}/api/v2/me/shipment/print
 *      -H Authorization: Bearer {{token}}
 *      JSON {orders[]}
 *   7.2. Resposta esperada:
 *      JSON {url} = URL para a impressão da etiqueta
 **/
